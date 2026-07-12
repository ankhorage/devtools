import { EventEmitter } from 'node:events';

import { describe, expect, it } from 'bun:test';

import { getDevtoolsToolCommand } from './commands.js';
import { runExternalToolWithDependencies } from './runExternalTool.js';

type FakeChildProcess = EventEmitter & {
  on(event: 'error', listener: (error: Error) => void): FakeChildProcess;
  on(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): FakeChildProcess;
};

describe('runExternalTool', () => {
  it('preserves argv, cwd, env, and returns the child exit code', async () => {
    const spawnCalls: unknown[] = [];
    const result = await runExternalToolWithDependencies(
      getDevtoolsToolCommand('lint'),
      ['--max-warnings=0', 'src'],
      { cwd: '/tmp/devtools-fixture', env: { FOO: 'bar' } },
      {
        logError: () => undefined,
        resolveExecutionTarget: () =>
          Promise.resolve({ command: process.execPath, args: ['/tmp/eslint.js'], shell: false }),
        spawnProcess: (command, args, options) => {
          spawnCalls.push({ command, args, options });
          const child = new EventEmitter() as FakeChildProcess;
          queueMicrotask(() => child.emit('exit', 7, null));
          return child;
        },
      },
    );

    expect(result).toEqual({ exitCode: 7 });
    expect(spawnCalls).toEqual([
      {
        command: process.execPath,
        args: ['/tmp/eslint.js', '--max-warnings=0', 'src'],
        options: {
          cwd: '/tmp/devtools-fixture',
          env: { FOO: 'bar' },
          shell: false,
          stdio: 'inherit',
        },
      },
    ]);
  });

  it('fails cleanly when command resolution fails', async () => {
    const messages: string[] = [];
    const result = await runExternalToolWithDependencies(
      getDevtoolsToolCommand('lint'),
      ['.'],
      undefined,
      {
        logError: (message) => messages.push(message),
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
