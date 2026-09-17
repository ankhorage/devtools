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
    expect(release).toContain(changesetsPolicy.workflowCommands.publish);
    expect(release).toContain('id: release');
    expect(release).toContain('git checkout -B main origin/main');
    expect(release).toContain('git rebase origin/main');
    expect(release).toContain('git push origin HEAD:main');
    expect(release).toContain('chore(release): version packages [skip ci]');
    expect(release).not.toContain('changesets/action');
    expect(release).not.toContain('changeset-release/main');
    expect(release).toContain('Finalize Changesets v3 tag and GitHub release');
    expect(release).not.toContain('bunx changeset');
  });

  test('dispatches each published Devtools version to the trusted Renovate rollout', async () => {
    const release = await workflowManagedFiles[1].render?.('.');

    expect(release).toContain("needs.release.outputs.package_name == '@ankhorage/devtools'");
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

test('fails release with an actionable diagnostic when the scoped App token is unavailable', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');

  expect(release).toContain('continue-on-error: true');
  expect(release).toContain("if: steps.release-token.outcome == 'failure'");
  expect(release).toContain('Renovate Sync App repository access required');
  expect(release).toContain('ankhorage-renovate-sync GitHub App is installed and authorized');
  expect(release).toContain('https://github.com/ankhorage/renovate/issues/115');
  expect(release).toContain('exit 1');
  expect(release).toContain('token: ${{ steps.release-token.outputs.token }}');
  expect(release.indexOf('Diagnose unavailable scoped release token')).toBeLessThan(
    release.indexOf('Checkout repository'),
  );
});

test('diagnoses npm scope authorization when an initial package publish fails', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');

  expect(release).toContain('package_absent=false');
  expect(release).toContain('npm view "$package_name" version --json > "$registry_evidence"');
  expect(release).toContain("p.error?.code !== 'E404'");
  expect(release).toContain(`if ! ${changesetsPolicy.workflowCommands.publish}; then`);
  expect(release).toContain('npm scope publish access required');
  expect(release).toContain('Read and write (publish and stage) access to the @ankhorage scope');
  expect(release).toContain('The already-versioned release commit on main is reusable');
  expect(release).toContain('do not create another version bump');
  expect(release).toContain('https://github.com/ankhorage/devtools/issues/225');
});

test('generates documentation after versioning and before the release commit', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');

  const versionIndex = release.indexOf(changesetsPolicy.workflowCommands.version);
  const docsIndex = release.indexOf('bun run docs');
  const commitIndex = release.indexOf('git commit -m "chore(release): version packages [skip ci]"');

  expect(release).toContain('if [ "$before_version" != "$after_version" ]; then');
  expect(release).toContain('process.exit(p.scripts?.docs ? 0 : 1)');
  expect(versionIndex).toBeGreaterThanOrEqual(0);
  expect(docsIndex).toBeGreaterThan(versionIndex);
  expect(commitIndex).toBeGreaterThan(docsIndex);
});

test('managed release recovers a canonical versioned commit without another bump', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');

  expect(release).toContain(
    `find .changeset -maxdepth 1 -type f -name '*.md' ! -name README.md -print -quit`,
  );
  expect(release).toContain('current_subject="$(git log -1 --pretty=%s)"');
  expect(release).toContain(
    'if [ "$current_subject" = "chore(release): version packages [skip ci]" ]; then',
  );
  expect(release).toContain('Recovering the canonical versioned release commit');
  expect(release).toContain('echo "versioned=true" >> "$GITHUB_OUTPUT"');
  expect(release).toContain('echo "package_name=$(node -p "require(\'./package.json\').name")"');
  expect(release).toContain('echo "package_version=$(node -p "require(\'./package.json\').version")"');
  expect(release).toContain('echo "release_sha=$(git rev-parse HEAD)"');
  expect(release).toContain('echo "versioned=false" >> "$GITHUB_OUTPUT"');
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
    expect(rendered).toContain("github.event.pull_request.user.login == 'renovate[bot]'");
    expect(rendered).toContain(
      "github.event.pull_request.user.login == 'ankhorage-renovate-sync[bot]'",
    );
    expect(rendered).toContain('      - labeled');
    expect(rendered).toContain(
      'group: renovate-${{ github.repository }}-${{ github.event.pull_request.number }}',
    );
    expect(rendered).toContain('cancel-in-progress: true');
    const template = await readFile(new URL('./files/renovate.yml', import.meta.url), 'utf8');
    expect(template).toContain(
      'ankhorage/renovate/.github/workflows/changeset.yml@db48610ed5bc6a1191798b123ce86419571d7bc6',
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
