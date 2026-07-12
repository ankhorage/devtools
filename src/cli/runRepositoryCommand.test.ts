import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { findDevtoolsCommandByPath } from './commands.js';
import { parseRepositoryArguments, runRepositoryCommand } from './runRepositoryCommand.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('repository commands', () => {
  it('syncs only the selected concern and status reports drift without writing', async () => {
    const target = await mkdtemp('/tmp/devtools-repository-command-');
    temporaryDirectories.push(target);
    const stdout: string[] = [];
    const stderr: string[] = [];
    const context = {
      cwd: target,
      writeStdout: (text: string) => stdout.push(text),
      writeStderr: (text: string) => stderr.push(text),
    };
    const workflowsSync = findDevtoolsCommandByPath(['workflows', 'sync']);
    const allStatus = findDevtoolsCommandByPath(['status']);
    if (workflowsSync?.kind !== 'repository' || allStatus?.kind !== 'repository') {
      throw new Error('Expected repository commands.');
    }

    expect((await runRepositoryCommand(workflowsSync, [], context)).exitCode).toBe(0);
    expect(await readFile(join(target, '.github/workflows/ci.yml'), 'utf8')).toContain(
      'bunx @ankhorage/ankh doctor validate .',
    );
    expect(await Bun.file(join(target, '.vscode/settings.json')).exists()).toBe(false);

    stdout.length = 0;
    expect((await runRepositoryCommand(allStatus, [], context)).exitCode).toBe(1);
    expect(stdout.join('')).toContain('.vscode/settings.json missing');
    expect(stderr).toEqual([]);
  });

  it('supports dry-run and validates arguments', async () => {
    const target = await mkdtemp('/tmp/devtools-repository-dry-run-');
    temporaryDirectories.push(target);
    const stdout: string[] = [];
    const sync = findDevtoolsCommandByPath(['sync']);
    if (sync?.kind !== 'repository') {
      throw new Error('Expected sync command.');
    }

    expect(
      (
        await runRepositoryCommand(sync, ['--dry-run'], {
          cwd: target,
          writeStdout: (text) => stdout.push(text),
          writeStderr: () => undefined,
        })
      ).exitCode,
    ).toBe(0);
    expect(stdout.join('')).toContain('would create');
    expect(await Bun.file(join(target, '.github/workflows/ci.yml')).exists()).toBe(false);
    expect(() => parseRepositoryArguments(['--dry-run'], false)).toThrow(
      '--dry-run is only valid for sync commands.',
    );
    expect(() => parseRepositoryArguments(['one', 'two'], true)).toThrow(
      'Only one target path may be provided.',
    );
  });
});
