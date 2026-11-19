import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { synchronizeReleaseTokenPermissionsAsync } from './synchronizeReleaseTokenPermissionsAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('selectively repairs the actual Studio release topology without changing owner acceptance', async () => {
  const target = await createStudioWorkflowTarget();
  const original = await readReleaseWorkflowAsync(target);

  expect(
    await synchronizeReleaseTokenPermissionsAsync({
      targetDirectory: target,
      operation: 'status',
      dryRun: false,
    }),
  ).toEqual({ relativePath: '.github/workflows/release.yml', state: 'outdated' });
  expect(
    await synchronizeReleaseTokenPermissionsAsync({
      targetDirectory: target,
      operation: 'sync',
      dryRun: true,
    }),
  ).toEqual({ relativePath: '.github/workflows/release.yml', action: 'would-update' });
  expect(await readReleaseWorkflowAsync(target)).toBe(original);

  expect(
    await synchronizeReleaseTokenPermissionsAsync({
      targetDirectory: target,
      operation: 'sync',
      dryRun: false,
    }),
  ).toEqual({ relativePath: '.github/workflows/release.yml', action: 'updated' });
  const synchronized = await readReleaseWorkflowAsync(target);

  expect(synchronized).toBe(
    original.replace(
      '          permission-contents: write\n\n      - name: Checkout exact release commit',
      '          permission-contents: write\n          permission-workflows: write\n\n      - name: Checkout exact release commit',
    ),
  );
  expect(synchronized).toContain('  studio-published-acceptance:');
  expect(synchronized).toContain('run: bun run test:acceptance:expo57-studio-standalone');
  expect(synchronized).toContain('      - studio-published-acceptance');
  expect(synchronized).toContain("repo: 'renovate'");
  expect(synchronized).toContain(
    '          repositories: renovate\n          permission-contents: write',
  );
  expect(synchronized).not.toContain(
    '          repositories: renovate\n          permission-contents: write\n          permission-workflows: write',
  );
  expect(
    await synchronizeReleaseTokenPermissionsAsync({
      targetDirectory: target,
      operation: 'sync',
      dryRun: false,
    }),
  ).toEqual({ relativePath: '.github/workflows/release.yml', action: 'unchanged' });
});

test('rejects ambiguous, duplicate, and broadened token definitions before writing', async () => {
  for (const [description, workflow] of MALFORMED_WORKFLOWS) {
    const target = await createStudioWorkflowTarget(workflow);
    for (const [operation, dryRun] of [
      ['status', false],
      ['sync', true],
      ['sync', false],
    ] as const) {
      const failure = await synchronizeReleaseTokenPermissionsAsync({
        targetDirectory: target,
        operation,
        dryRun,
      }).then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure, `${description}: ${operation}${dryRun ? ' dry-run' : ''}`).toBeInstanceOf(
        Error,
      );
      expect(await readReleaseWorkflowAsync(target)).toBe(workflow);
    }
  }
});

/*** Create a target holding the relevant byte-preserving Studio release workflow fixture. */
async function createStudioWorkflowTarget(workflow = STUDIO_RELEASE_WORKFLOW): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-release-token-permissions-');
  temporaryDirectories.push(target);
  await mkdir(join(target, '.github/workflows'), { recursive: true });
  await writeFile(join(target, '.github/workflows/release.yml'), workflow, 'utf8');
  return target;
}

/*** Read the target release workflow to make every mutation assertion byte-exact. */
async function readReleaseWorkflowAsync(target: string): Promise<string> {
  return await readFile(join(target, '.github/workflows/release.yml'), 'utf8');
}

const STUDIO_RELEASE_WORKFLOW = `name: Release

on:
  workflow_dispatch:

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Create the scoped release token
        id: release-token
        continue-on-error: true
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
        with:
          client-id: \${{ vars.ANKHORAGE_RENOVATE_SYNC_CLIENT_ID }}
          private-key: \${{ secrets.ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY }}
          owner: ankhorage
          repositories: \${{ github.event.repository.name }}
          permission-contents: write
          permission-workflows: write

      - name: Version packages directly on main
        id: release
        run: bun run version-packages

  verify-publication:
    needs: release
    if: needs.release.outputs.versioned == 'true'
    runs-on: ubuntu-latest
    steps:
      - name: Verify published package
        run: npm view \${{ needs.release.outputs.package_name }} version

  studio-published-acceptance:
    needs:
      - release
      - verify-publication
    if: >-
      needs.release.outputs.versioned == 'true' &&
      needs.verify-publication.result == 'success' &&
      needs.release.outputs.package_name == '@ankhorage/studio'
    runs-on: ubuntu-latest
    steps:
      - name: Validate exact published Studio registry consumer
        run: bun run test:acceptance:expo57-studio-standalone

  finalize:
    needs:
      - release
      - verify-publication
      - studio-published-acceptance
    if: >-
      needs.release.outputs.versioned == 'true' &&
      needs.verify-publication.result == 'success' &&
      (needs.release.outputs.package_name != '@ankhorage/studio' || needs.studio-published-acceptance.result == 'success')
    runs-on: ubuntu-latest
    steps:
      - name: Create the scoped release token
        id: release-token
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
        with:
          client-id: \${{ vars.ANKHORAGE_RENOVATE_SYNC_CLIENT_ID }}
          private-key: \${{ secrets.ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY }}
          owner: ankhorage
          repositories: \${{ github.event.repository.name }}
          permission-contents: write

      - name: Checkout exact release commit
        uses: actions/checkout@v4

      - name: Create the scoped rollout token
        id: rollout-token
        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0
        with:
          client-id: \${{ vars.ANKHORAGE_RENOVATE_SYNC_CLIENT_ID }}
          private-key: \${{ secrets.ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY }}
          owner: ankhorage
          repositories: renovate
          permission-contents: write

      - name: Trigger the package consumer rollout
        run: |
          echo "repo: 'renovate'"
`;

const MALFORMED_WORKFLOWS = [
  ['invalid YAML', `malformed: [\n${STUDIO_RELEASE_WORKFLOW}`],
  ['multiple YAML documents', `${STUDIO_RELEASE_WORKFLOW}---\nname: replacement\n`],
  [
    'duplicate token',
    STUDIO_RELEASE_WORKFLOW.replace('  finalize:', '  release:\n    steps: []\n\n  finalize:'),
  ],
  [
    'unknown token',
    STUDIO_RELEASE_WORKFLOW.replace(
      '          permission-contents: write\n\n      - name: Trigger the package consumer rollout',
      '          permission-contents: write\n          permission-actions: write\n\n      - name: Trigger the package consumer rollout',
    ),
  ],
  [
    'duplicate permission',
    STUDIO_RELEASE_WORKFLOW.replace(
      '          permission-contents: write\n\n      - name: Checkout exact release commit',
      '          permission-contents: write\n          permission-contents: write\n\n      - name: Checkout exact release commit',
    ),
  ],
  [
    'duplicate repository ownership',
    STUDIO_RELEASE_WORKFLOW.replace(
      '          owner: ankhorage\n          repositories: ${{ github.event.repository.name }}',
      '          owner: ankhorage\n          repositories: ${{ github.event.repository.name }}\n          repositories: renovate',
    ),
  ],
  [
    'substituted token action',
    STUDIO_RELEASE_WORKFLOW.replace(
      'uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0',
      'uses: actions/create-github-app-token@main',
    ),
  ],
  [
    'unexpected token syntax',
    STUDIO_RELEASE_WORKFLOW.replace(
      '          permission-contents: write\n          permission-workflows: write',
      '          permission-contents: write\n          permission-workflows: write\n          permission-actions: write',
    ),
  ],
] as const;
