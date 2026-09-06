import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import { changesetsPolicy } from '../../policy/changesetsPolicy.js';
import { inspectManagedFiles, syncManagedFiles } from '../shared/managedFiles.js';
import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('managed workflows', () => {
  test('render the canonical Bun and Node runtime policies', async () => {
    for (const definition of workflowManagedFiles.slice(0, 2)) {
      expect(definition.render).toBeDefined();
      const rendered = await definition.render?.('.');
      expect(rendered).toContain(`bun-version: '${bunRuntimePolicy.version}'`);
      expect(rendered).toContain(`node-version: '${nodeRuntimePolicy.setupVersion}'`);
      expect(rendered).not.toContain('__ANKH_BUN_VERSION__');
      expect(rendered).not.toContain('__ANKH_NODE_VERSION__');
      expect(rendered).not.toContain('__ANKH_CHANGESETS_');
    }
  });

  test('renders the canonical Changesets commands into CI and release', async () => {
    const ci = await workflowManagedFiles[0].render?.('.');
    const release = await workflowManagedFiles[1].render?.('.');

    expect(ci).toContain(changesetsPolicy.workflowCommands.status);
    expect(release).toContain(changesetsPolicy.workflowCommands.version);
    expect(release).toContain(`run: ${changesetsPolicy.workflowCommands.publish}`);
    expect(release).toContain('id: release');
    expect(release).toContain('git checkout -B main origin/main');
    expect(release).toContain('git rebase origin/main');
    expect(release).toContain('git push origin HEAD:main');
    expect(release).toContain('chore(release): version packages [skip ci]');
    expect(release).not.toContain('changesets/action');
    expect(release).not.toContain('changeset-release/main');
    expect(release).toContain('Finalize Changesets v3 tags and GitHub releases');
    expect(release).toContain('git tag --points-at HEAD');
    expect(release).toContain('git push origin "refs/tags/$tag"');
    expect(release).toContain(
      'gh release create "$tag" --repo "$GITHUB_REPOSITORY" --generate-notes',
    );
    expect(release).not.toContain('bunx changeset');
  });

  test('dispatches each published Devtools version to the trusted Renovate rollout', async () => {
    const release = await workflowManagedFiles[1].render?.('.');

    expect(release).toContain("steps.release.outputs.versioned == 'true'");
    expect(release).toContain(
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
    );
    expect(release).toContain('repositories: renovate');
    expect(release).toContain('permission-contents: write');
    expect(release).toContain('github-token: ${{ steps.rollout-token.outputs.token }}');
    expect(release).toContain("release.name !== '@ankhorage/devtools'");
    expect(release).toContain("event_type: 'devtools-release'");
    expect(release).toContain("repo: 'renovate'");
    expect(release).toContain('Changesets must report one exact published Devtools version.');
  });
});

describe('managed CI Changesets contract', () => {
  test('keeps the missing-Changeset guard strict for every ordinary pull request', async () => {
    const ci = await workflowManagedFiles[0].render?.('.');

    expect(ci).toContain(
      `      - name: Check changesets
        if: github.event_name == 'pull_request'
        run: |
          if node -e "const p=require('./package.json'); process.exit(p.scripts?.['changeset:status'] ? 0 : 1)"; then
            ${changesetsPolicy.workflowCommands.status}
          else
            echo "No changeset:status script found; skipping."
          fi`,
    );
    expect(changesetsPolicy.packageScripts['changeset:status']).toContain('--since=origin/main');
  });
});

describe('managed Renovate workflow', () => {
  test('pins the Renovate workflow and passes scoped App credentials', async () => {
    const definition = getRenovateWorkflowDefinition();
    const rendered = await definition.render?.('.');

    expect(rendered).toMatch(
      /ankhorage\/renovate\/\.github\/workflows\/changeset\.yml@[0-9a-f]{40}/u,
    );
    expect(rendered).toContain("github.actor == 'renovate[bot]'");
    expect(rendered).toContain("github.actor == 'ankhorage-renovate-sync[bot]'");
    expect(rendered).toContain('      - labeled');
    expect(rendered).toContain(
      'group: renovate-${{ github.repository }}-${{ github.event.pull_request.number }}',
    );
    expect(rendered).toContain('cancel-in-progress: true');
    const template = await readFile(new URL('./files/renovate.yml', import.meta.url), 'utf8');
    expect(template).toContain(
      'ankhorage/renovate/.github/workflows/changeset.yml@03f29fb8f81d15c51bf16b5374ad92fe8f95e3b5',
    );
    expect(rendered).toContain('contents: read');
    expect(rendered).toContain('checks: read');
    expect(rendered).toContain('issues: read');
    expect(rendered).toContain('statuses: read');
    expect(rendered).not.toContain('actions: write');
    expect(rendered).toContain(
      'renovate_sync_client_id: ${{ vars.ANKHORAGE_RENOVATE_SYNC_CLIENT_ID }}',
    );
    expect(rendered).toContain(
      'renovate_sync_private_key: ${{ secrets.ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY }}',
    );

    const ci = await workflowManagedFiles[0].render?.('.');
    expect(ci).toContain('workflow_dispatch:');
  });
});

test('preserves a valid Renovate-managed digest across status, dry-run, and sync', async () => {
  const target = await createWorkflowTarget();
  const definition = getRenovateWorkflowDefinition();
  const bootstrap = await definition.render?.(target);
  if (bootstrap === undefined) throw new Error('Expected the Renovate workflow renderer.');

  const preserved = bootstrap.replace(
    /(changeset\.yml@)[0-9a-f]{40}/u,
    `$1${PRESERVED_RENOVATE_DIGEST}`,
  );
  const workflowPath = join(target, definition.relativePath);
  const outdated = preserved.replace('contents: read', 'contents: none');
  await writeFile(workflowPath, outdated);

  expect(await inspectManagedFiles(target, [definition])).toEqual([
    { relativePath: definition.relativePath, state: 'outdated' },
  ]);
  expect(await syncManagedFiles(target, [definition], { dryRun: true })).toEqual([
    { relativePath: definition.relativePath, action: 'would-update' },
  ]);
  expect(await readFile(workflowPath, 'utf8')).toBe(outdated);
  expect(await syncManagedFiles(target, [definition], { dryRun: false })).toEqual([
    { relativePath: definition.relativePath, action: 'updated' },
  ]);
  expect(await readFile(workflowPath, 'utf8')).toBe(preserved);
  expect(await syncManagedFiles(target, [definition], { dryRun: false })).toEqual([
    { relativePath: definition.relativePath, action: 'unchanged' },
  ]);
});

test('rejects mutable and ambiguous Renovate workflow references', async () => {
  const target = await createWorkflowTarget();
  const definition = getRenovateWorkflowDefinition();
  const bootstrap = await definition.render?.(target);
  if (bootstrap === undefined) throw new Error('Expected the Renovate workflow renderer.');
  const workflowPath = join(target, definition.relativePath);

  await writeFile(
    workflowPath,
    bootstrap.replace(/changeset\.yml@[0-9a-f]{40}/u, 'changeset.yml@main'),
  );
  expect(definition.render?.(target)).rejects.toThrow(
    'Expected exactly one immutable Renovate digest in the target workflow.',
  );

  await writeFile(
    workflowPath,
    `${bootstrap}    uses: ankhorage/renovate/.github/workflows/changeset.yml@${PRESERVED_RENOVATE_DIGEST}\n`,
  );
  expect(definition.render?.(target)).rejects.toThrow(
    'Expected exactly one immutable Renovate digest in the target workflow.',
  );
});

function getRenovateWorkflowDefinition() {
  const definition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/renovate.yml',
  );
  if (definition === undefined) throw new Error('Missing managed Renovate workflow definition.');
  return definition;
}

async function createWorkflowTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-workflow-');
  temporaryDirectories.push(target);
  await mkdir(join(target, '.github/workflows'), { recursive: true });
  return target;
}

const PRESERVED_RENOVATE_DIGEST = 'f'.repeat(40);
