import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  inspectManagedFiles,
  syncManagedFiles,
} from '../../features/managed-files/managedFiles.js';
import { formatYamlAsync } from '../prettier/formatYamlAsync.js';
import { workflowManagedFiles } from './index.js';
import { createCiImpactRunnerDefinition } from './createCiImpactRunnerDefinition.js';

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

test('synchronizes the managed impact runner only with its CI workflow', async () => {
  const target = await createWorkflowTarget();
  const ciWithoutImpact = createFixtureCiWorkflow(false);
  const absentRunner = createCiImpactRunnerDefinition(ciWithoutImpact);
  expect(await syncManagedFiles(target, [absentRunner], { dryRun: false })).toEqual([]);
  expect(await Bun.file(join(target, absentRunner.relativePath)).exists()).toBe(false);

  const ciWorkflow = createFixtureCiWorkflow(true);
  const runner = createCiImpactRunnerDefinition(ciWorkflow);
  const definitions = [ciWorkflow, runner];

  expect(await syncManagedFiles(target, definitions, { dryRun: false })).toEqual([
    { relativePath: '.github/workflows/ci.yml', action: 'created' },
    { relativePath: '.github/scripts/ci-impact.ts', action: 'created' },
  ]);
  expect(await readFile(join(target, runner.relativePath), 'utf8')).toContain(
    'export function planCiImpact(',
  );
  expect(await inspectManagedFiles(target, definitions)).toEqual([
    { relativePath: '.github/workflows/ci.yml', state: 'current' },
    { relativePath: '.github/scripts/ci-impact.ts', state: 'current' },
  ]);
  expect(await syncManagedFiles(target, definitions, { dryRun: false })).toEqual([
    { relativePath: '.github/workflows/ci.yml', action: 'unchanged' },
    { relativePath: '.github/scripts/ci-impact.ts', action: 'unchanged' },
  ]);

  await writeFile(join(target, runner.relativePath), 'outdated runner\n');
  expect(await syncManagedFiles(target, definitions, { dryRun: false })).toEqual([
    { relativePath: '.github/workflows/ci.yml', action: 'unchanged' },
    { relativePath: '.github/scripts/ci-impact.ts', action: 'updated' },
  ]);

  const removedRunner = createCiImpactRunnerDefinition(ciWithoutImpact);
  expect(
    await syncManagedFiles(target, [ciWithoutImpact, removedRunner], { dryRun: false }),
  ).toEqual([
    { relativePath: '.github/workflows/ci.yml', action: 'updated' },
    { relativePath: '.github/scripts/ci-impact.ts', action: 'removed' },
  ]);
  expect(await Bun.file(join(target, runner.relativePath)).exists()).toBe(false);
});

/*** Render a fixture workflow that either dispatches every impact suite or uses ordinary tests. */
function createFixtureCiWorkflow(withImpact: boolean) {
  return {
    relativePath: '.github/workflows/ci.yml',
    render: () =>
      withImpact
        ? `jobs:\n  validate:\n    steps:\n      - id: impact\n        run: bun .github/scripts/ci-impact.ts plan\n      - run: bun .github/scripts/ci-impact.ts unit\n      - run: bun .github/scripts/ci-impact.ts e2e\n      - run: bun .github/scripts/ci-impact.ts smoke\n`
        : 'jobs:\n  validate:\n    steps:\n      - run: bun test\n',
  };
}

/*** Create a consumer fixture that opts into managed release workflows. */
async function createWorkflowTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-workflow-render-');
  temporaryDirectories.push(target);
  await mkdir(join(target, '.changeset'), { recursive: true });
  await mkdir(join(target, '.github/workflows'), { recursive: true });
  await writeFile(join(target, '.changeset/config.json'), '{}\n');
  return target;
}
