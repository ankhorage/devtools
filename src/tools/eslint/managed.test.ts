import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { inspectManagedFiles, syncManagedFiles } from '../../features/managed-files/managedFiles.js';
import { eslintManagedFiles } from './managed.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('synchronizes the examples config only while a root TypeScript example exists', async () => {
  const target = await mkdtemp('/tmp/devtools-eslint-managed-');
  temporaryDirectories.push(target);

  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(false);

  await mkdir(join(target, 'examples'));
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(false);

  await writeFile(join(target, 'examples', 'example.ts'), 'export {};\n');
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  const examplesConfig = await readFile(join(target, 'eslint.examples.config.mjs'), 'utf8');
  await writeFile(join(target, 'eslint.examples.config.mjs'), `${examplesConfig}\n// stale\n`);
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await readFile(join(target, 'eslint.examples.config.mjs'), 'utf8')).toBe(examplesConfig);

  await rm(join(target, 'examples'), { recursive: true });
  expect(await syncManagedFiles(target, eslintManagedFiles, { dryRun: true })).toContainEqual({
    relativePath: 'eslint.examples.config.mjs',
    action: 'would-remove',
  });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(true);

  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(false);
});

test('ignores dependency, generated, and declaration files when detecting TypeScript examples', async () => {
  const target = await mkdtemp('/tmp/devtools-eslint-managed-');
  temporaryDirectories.push(target);

  await mkdir(join(target, 'examples/basic-usage/node_modules/dependency'), { recursive: true });
  await mkdir(join(target, 'examples/basic-usage/dist'), { recursive: true });
  await writeFile(
    join(target, 'examples/basic-usage/node_modules/dependency/index.ts'),
    'export const dependency = true;\n',
  );
  await writeFile(join(target, 'examples/basic-usage/types.d.ts'), 'export interface Example {}\n');
  await writeFile(
    join(target, 'examples/basic-usage/dist/generated.ts'),
    'export const generated = true;\n',
  );
  await writeFile(join(target, 'examples/basic-usage/example.json'), '{}\n');

  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(false);

  await writeFile(join(target, 'examples/basic-usage/main.tsx'), 'export {};\n');
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await Bun.file(join(target, 'eslint.examples.config.mjs')).exists()).toBe(true);
});

test('protects a consumer config without an examples directory or a local override file', async () => {
  const target = await mkdtemp('/tmp/devtools-eslint-managed-');
  temporaryDirectories.push(target);
  const configPath = join(target, 'eslint.examples.config.mjs');
  const original = 'export default [{ rules: { semi: "error" } }];\n';
  await writeFile(configPath, original);
  const statusError = await inspectManagedFiles(target, eslintManagedFiles).catch(
    (error: unknown) => error,
  );
  expect(statusError instanceof Error && statusError.message).toContain('consumer-owned');
  const syncError = await syncManagedFiles(target, eslintManagedFiles, { dryRun: false }).catch(
    (error: unknown) => error,
  );
  expect(syncError instanceof Error && syncError.message).toContain('consumer-owned');
  expect(await readFile(configPath, 'utf8')).toBe(original);
  expect(await Bun.file(join(target, 'eslint.local.config.mjs')).exists()).toBe(false);
});
