import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { syncManagedFiles } from '../shared/managedFiles.js';
import { eslintManagedFiles } from './managed.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('synchronizes the examples config only while a root examples directory exists', async () => {
  const target = await mkdtemp('/tmp/devtools-eslint-managed-');
  temporaryDirectories.push(target);

  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(false);

  await mkdir(join(target, 'examples'));
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  const examplesConfig = await readFile(join(target, 'eslint.examples.config.mjs'), 'utf8');
  expect(examplesConfig).toContain("const exampleFiles = ['examples/**/*.{ts,tsx}']");
  expect(examplesConfig).toContain("'./examples/**/tsconfig.json'");
  expect(examplesConfig).toContain("import localConfig from './eslint.local.config.mjs'");

  await rm(join(target, 'examples'), { recursive: true });
  expect(await syncManagedFiles(target, eslintManagedFiles, { dryRun: true })).toContainEqual({
    relativePath: 'eslint.examples.config.mjs',
    action: 'would-remove',
  });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(true);

  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(false);
});
