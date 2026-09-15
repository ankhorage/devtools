import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { findDevtoolsCommandByPath } from '../../cli/commands.js';
import { runRepositoryCommand } from '../../cli/runRepositoryCommand.js';
import { inspectManagedFiles, syncManagedFiles } from '../shared/managedFiles.js';
import { gitignoreManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('removes documentation directory ignore rules while preserving repository-owned entries', async () => {
  const target = await createTarget();
  const gitignorePath = join(target, '.gitignore');
  await writeFile(
    gitignorePath,
    ['node_modules/', 'docs/', '/paradox', '!docs/keep.md', 'custom/', ''].join('\n'),
  );

  expect(await inspectManagedFiles(target, gitignoreManagedFiles)).toEqual([
    { relativePath: '.gitignore', state: 'outdated' },
  ]);
  expect(await syncManagedFiles(target, gitignoreManagedFiles, { dryRun: true })).toEqual([
    { relativePath: '.gitignore', action: 'would-update' },
  ]);
  expect(await syncManagedFiles(target, gitignoreManagedFiles, { dryRun: false })).toEqual([
    { relativePath: '.gitignore', action: 'updated' },
  ]);
  expect(await readFile(gitignorePath, 'utf8')).toBe(
    ['node_modules/', '!docs/keep.md', 'custom/', ''].join('\n'),
  );
  expect(await syncManagedFiles(target, gitignoreManagedFiles, { dryRun: false })).toEqual([
    { relativePath: '.gitignore', action: 'unchanged' },
  ]);
});

test('aggregate repository sync applies the documentation gitignore policy', async () => {
  const target = await createTarget();
  await writeFile(join(target, 'package.json'), '{"name":"fixture","type":"module"}\n');
  await writeFile(join(target, '.gitignore'), 'dist/\ndocs/\nparadox/\ncustom/\n');
  const command = findDevtoolsCommandByPath(['sync']);
  if (command?.kind !== 'repository') throw new Error('Expected aggregate repository sync command.');

  const stdout: string[] = [];
  const stderr: string[] = [];
  expect(
    (
      await runRepositoryCommand(command, [], {
        cwd: target,
        syncDependencies: async () => ({ relativePath: 'bun.lock', action: 'unchanged' }),
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
      })
    ).exitCode,
  ).toBe(0);
  expect(await readFile(join(target, '.gitignore'), 'utf8')).toBe('dist/\ncustom/\n');
  expect(stdout.join('')).toContain('.gitignore updated');
  expect(stderr).toEqual([]);
});

test('does not create a gitignore when the repository does not own one', async () => {
  const target = await createTarget();

  expect(await inspectManagedFiles(target, gitignoreManagedFiles)).toEqual([]);
  expect(await syncManagedFiles(target, gitignoreManagedFiles, { dryRun: false })).toEqual([]);
  expect(await Bun.file(join(target, '.gitignore')).exists()).toBe(false);
});

async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-gitignore-');
  temporaryDirectories.push(target);
  return target;
}
