import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'bun:test';

import { getDevtoolsCommand } from './devtoolsCommands.js';
import { runDevtoolsCommandWithDependencies } from './runDevtoolsCommand.js';

type FakeChildProcess = EventEmitter & {
  on(event: 'error', listener: (error: Error) => void): FakeChildProcess;
  on(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): FakeChildProcess;
};

describe('runDevtoolsCommand', () => {
  it('preserves argv, cwd, env, and returns the child exit code', async () => {
    const command = getDevtoolsCommand('lint');
    const messages: string[] = [];
    const spawnCalls: {
      command: string;
      args: readonly string[];
      options: {
        cwd: string;
        env: NodeJS.ProcessEnv;
        shell: boolean;
        stdio: 'inherit';
      };
    }[] = [];

    const result = await runDevtoolsCommandWithDependencies(
      command,
      ['--max-warnings=0', 'src'],
      {
        cwd: '/tmp/devtools-fixture',
        env: { ...process.env, FOO: 'bar' },
      },
      {
        logError: (message) => {
          messages.push(message);
        },
        resolveExecutionTarget: () =>
          Promise.resolve({
            command: process.execPath,
            args: ['/tmp/eslint.js'],
            shell: false,
          }),
        spawnProcess: (spawnCommand, args, options) => {
          spawnCalls.push({
            command: spawnCommand,
            args,
            options: {
              cwd: options.cwd,
              env: options.env,
              shell: options.shell,
              stdio: options.stdio,
            },
          });

          const child = new EventEmitter() as FakeChildProcess;

          queueMicrotask(() => {
            child.emit('exit', 7, null);
          });

          return child;
        },
      },
    );

    expect(result).toEqual({ exitCode: 7 });
    expect(messages).toEqual([]);
    expect(spawnCalls).toEqual([
      {
        command: process.execPath,
        args: ['/tmp/eslint.js', '--max-warnings=0', 'src'],
        options: {
          cwd: '/tmp/devtools-fixture',
          env: { ...process.env, FOO: 'bar' },
          shell: false,
          stdio: 'inherit',
        },
      },
    ]);
  });

  it('treats spawn errors as exit code 1', async () => {
    const messages: string[] = [];

    const result = await runDevtoolsCommandWithDependencies(
      getDevtoolsCommand('format'),
      ['--check', '.'],
      undefined,
      {
        logError: (message) => {
          messages.push(message);
        },
        resolveExecutionTarget: () =>
          Promise.resolve({
            command: '/tmp/prettier',
            args: [],
            shell: false,
          }),
        spawnProcess: () => {
          const child = new EventEmitter() as FakeChildProcess;

          queueMicrotask(() => {
            child.emit('error', new Error('spawn failed'));
          });

          return child;
        },
      },
    );

    expect(result).toEqual({ exitCode: 1 });
    expect(messages).toEqual(['Failed to start prettier: spawn failed']);
  });

  it('treats process signals as non-zero failures with a clear message', async () => {
    const messages: string[] = [];

    const result = await runDevtoolsCommandWithDependencies(
      getDevtoolsCommand('knip'),
      [],
      undefined,
      {
        logError: (message) => {
          messages.push(message);
        },
        resolveExecutionTarget: () =>
          Promise.resolve({
            command: '/tmp/knip',
            args: [],
            shell: false,
          }),
        spawnProcess: () => {
          const child = new EventEmitter() as FakeChildProcess;

          queueMicrotask(() => {
            child.emit('exit', null, 'SIGTERM');
          });

          return child;
        },
      },
    );

    expect(result).toEqual({ exitCode: 1 });
    expect(messages).toEqual(['knip exited with signal SIGTERM.']);
  });

  it('fails cleanly when command resolution fails', async () => {
    const messages: string[] = [];

    const result = await runDevtoolsCommandWithDependencies(
      getDevtoolsCommand('lint'),
      ['.'],
      undefined,
      {
        logError: (message) => {
          messages.push(message);
        },
        resolveExecutionTarget: () => Promise.reject(new Error('missing eslint binary')),
        spawnProcess: () => {
          throw new Error('spawn should not run');
        },
      },
    );

    expect(result).toEqual({ exitCode: 1 });
    expect(messages).toEqual(['Failed to resolve eslint: missing eslint binary']);
  });
});
