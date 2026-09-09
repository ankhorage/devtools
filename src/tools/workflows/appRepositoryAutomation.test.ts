import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { inspectManagedFiles, syncManagedFiles } from '../shared/managedFiles.js';
import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('bootstraps app repository dependency automation without package release workflow', async () => {
  const target = await createTarget();

  const results = await syncManagedFiles(target, workflowManagedFiles, { dryRun: false });

  expect(results.map(({ relativePath }) => relativePath)).toEqual([
    '.github/workflows/ci.yml',
    '.github/workflows/renovate.yml',
    'renovate.json5',
  ]);
  expect(await Bun.file(join(target, '.github/workflows/release.yml')).exists()).toBe(false);
  expect(await readFile(join(target, 'renovate.json5'), 'utf8')).toContain(
    "extends: ['github>ankhorage/renovate']",
  );

  const localRenovateConfig = `{
  extends: ['github>ankhorage/renovate'],
  ignoreDeps: ['app-owned-example'],
}\n`;
  await writeFile(join(target, 'renovate.json5'), localRenovateConfig);
  await syncManagedFiles(target, workflowManagedFiles, { dryRun: false });
  expect(await readFile(join(target, 'renovate.json5'), 'utf8')).toBe(localRenovateConfig);
});

test('manages the package release workflow only for Changesets repositories', async () => {
  const target = await createTarget();
  const releasePath = join(target, '.github/workflows/release.yml');

  await mkdir(join(target, '.changeset'), { recursive: true });
  await writeFile(join(target, '.changeset/config.json'), '{}\n');
  await syncManagedFiles(target, workflowManagedFiles, { dryRun: false });
  expect(await Bun.file(releasePath).exists()).toBe(true);

  await rm(join(target, '.changeset'), { recursive: true });
  expect(await inspectManagedFiles(target, workflowManagedFiles)).toContainEqual({
    relativePath: '.github/workflows/release.yml',
    state: 'obsolete',
  });
  await syncManagedFiles(target, workflowManagedFiles, { dryRun: false });
  expect(await Bun.file(releasePath).exists()).toBe(false);
});

async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-app-repository-automation-');
  temporaryDirectories.push(target);
  return target;
}
