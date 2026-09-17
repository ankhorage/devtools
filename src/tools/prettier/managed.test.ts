import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { inspectManagedFiles, syncManagedFiles } from '../shared/managedFiles.js';
import { prettierManagedFiles } from './managed.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('preserves custom Prettier ignores and appends generated artifacts once', async () => {
  const target = await createTarget();
  await writeFile(join(target, '.prettierignore'), '# repository-owned\ncoverage\nnode_modules\n');

  const first = await syncManagedFiles(target, prettierManagedFiles, { dryRun: false });
  expect(first.find((result) => result.relativePath === '.prettierignore')?.action).toBe('updated');
  expect(await readFile(join(target, '.prettierignore'), 'utf8')).toBe(
    '# repository-owned\ncoverage\nnode_modules\ndist\nREADME.md\nparadox/\n',
  );

  const second = await syncManagedFiles(target, prettierManagedFiles, { dryRun: false });
  expect(second.find((result) => result.relativePath === '.prettierignore')?.action).toBe(
    'unchanged',
  );
  expect((await inspectManagedFiles(target, prettierManagedFiles)).find(
    (status) => status.relativePath === '.prettierignore',
  )?.state).toBe('current');
});

test('creates the canonical Prettier ignore file when it is missing', async () => {
  const target = await createTarget();

  const results = await syncManagedFiles(target, prettierManagedFiles, { dryRun: false });
  expect(results.find((result) => result.relativePath === '.prettierignore')?.action).toBe('created');
  expect(await readFile(join(target, '.prettierignore'), 'utf8')).toBe(
    'node_modules\ndist\nREADME.md\nparadox/\n',
  );
});

async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-prettier-managed-');
  temporaryDirectories.push(target);
  return target;
}
