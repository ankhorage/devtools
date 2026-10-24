import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  inspectManagedFiles,
  syncManagedFiles,
} from '../../features/managed-files/managedFiles.js';
import { formatYamlAsync } from '../prettier/formatYamlAsync.js';
import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('synchronizes CI and release as shared-Prettier-stable YAML', async () => {
  const target = await createWorkflowTarget();
  const definitions = workflowManagedFiles.slice(0, 2);

  expect(await syncManagedFiles(target, definitions, { dryRun: false })).toEqual([
    { relativePath: '.github/workflows/ci.yml', action: 'created' },
    { relativePath: '.github/workflows/release.yml', action: 'created' },
  ]);

  for (const definition of definitions) {
    const contents = await readFile(join(target, definition.relativePath), 'utf8');
    expect(await formatYamlAsync(contents)).toBe(contents);
  }

  expect(await inspectManagedFiles(target, definitions)).toEqual([
    { relativePath: '.github/workflows/ci.yml', state: 'current' },
    { relativePath: '.github/workflows/release.yml', state: 'current' },
  ]);
  expect(await syncManagedFiles(target, definitions, { dryRun: false })).toEqual([
    { relativePath: '.github/workflows/ci.yml', action: 'unchanged' },
    { relativePath: '.github/workflows/release.yml', action: 'unchanged' },
  ]);
});

test('skips patch-only Renovate PR validation but retains all main and regular PR gates', async () => {
  const ci = await workflowManagedFiles[0].render?.('.');
  expect(ci).toBeDefined();
  expect(ci).toContain("github.event_name != 'pull_request' ||");
  expect(ci).toContain('renovate[bot]');
  expect(ci).toContain('ankhorage-renovate-sync[bot]');
  expect(ci).toContain("startsWith(github.head_ref, 'renovate/patch-')");
  expect(ci).toContain("contains(github.event.pull_request.labels.*.name, 'renovate:patch')");
  expect(ci).toContain('  validate:');
  expect(ci).toContain('cancel-in-progress: ${{ github.event_name == \'pull_request\' }}');
  expect(ci).toContain('github.event.pull_request.number || github.ref');
  expect(ci).toContain('    branches:\n      - main');
});

/*** Create a consumer fixture that opts into managed release workflows. */
async function createWorkflowTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-workflow-render-');
  temporaryDirectories.push(target);
  await mkdir(join(target, '.changeset'), { recursive: true });
  await mkdir(join(target, '.github/workflows'), { recursive: true });
  await writeFile(join(target, '.changeset/config.json'), '{}\n');
  return target;
}
