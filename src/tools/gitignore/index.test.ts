import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  inspectManagedFiles,
  syncManagedFiles,
} from '../../features/managed-files/managedFiles.js';
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

test('creates the minimal gitignore without mutating a dry run', async () => {
  const target = await createTarget();

  expect(await inspectManagedFiles(target, gitignoreManagedFiles)).toEqual([
    { relativePath: '.gitignore', state: 'missing' },
  ]);
  expect(await syncManagedFiles(target, gitignoreManagedFiles, { dryRun: true })).toEqual([
    { relativePath: '.gitignore', action: 'would-create' },
  ]);
  expect(await Bun.file(join(target, '.gitignore')).exists()).toBe(false);
  expect(await syncManagedFiles(target, gitignoreManagedFiles, { dryRun: false })).toEqual([
    { relativePath: '.gitignore', action: 'created' },
  ]);
  expect(await readFile(join(target, '.gitignore'), 'utf8')).toBe('node_modules\ndist\n');
});

async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-gitignore-');
  temporaryDirectories.push(target);
  return target;
}
