import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { getDevtoolsToolCommand } from '../../cli/commands.js';
import { runExternalTool } from '../../cli/runExternalTool.js';
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
    expect(ci).toContain(changesetsPolicy.workflowCommands.versionPackagesStatus);
    expect(release).toContain(`version: ${changesetsPolicy.workflowCommands.version}`);
    expect(release).toContain(`publish: ${changesetsPolicy.workflowCommands.publish}`);
    expect(release).toContain('id: changesets');
    expect(release).toContain('createGithubReleases: false');
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

    expect(release).toContain("steps.changesets.outputs.published == 'true'");
    expect(release).toContain(
      'actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1',
    );
    expect(release).toContain('repositories: renovate');
    expect(release).toContain('permission-contents: write');
    expect(release).toContain('github-token: ${{ steps.rollout-token.outputs.token }}');
    expect(release).toContain("candidate.name === '@ankhorage/devtools'");
    expect(release).toContain("event_type: 'devtools-release'");
    expect(release).toContain("repo: 'renovate'");
    expect(release).toContain('Changesets must report one exact published Devtools version.');
  });
});

describe('managed CI Changesets contract', () => {
  test('validates trusted Version Packages pull requests without requiring a new changeset', async () => {
    const ci = await workflowManagedFiles[0].render?.('.');

    expect(ci).toContain(
      `      - name: Validate Version Packages metadata
        if: github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository && github.head_ref == 'changeset-release/main'
        run: |
          if node -e "const p=require('./package.json'); process.exit(p.scripts?.changeset ? 0 : 1)"; then
            ${changesetsPolicy.workflowCommands.versionPackagesStatus}
          else
            echo "No changeset script found; skipping."
          fi`,
    );
    expect(changesetsPolicy.workflowCommands.versionPackagesStatus).toContain('--since=HEAD');
  });

  test('executes Version Packages status from a detached checkout without local main', async () => {
    const target = await createDetachedVersionPackagesCheckout();
    const result = await runExternalTool(
      getDevtoolsToolCommand('changeset'),
      changesetsPolicy.workflowArguments.versionPackagesStatus,
      { cwd: target },
    );

    expect(result.exitCode).toBe(0);
  });

  test('keeps the missing-Changeset guard strict for every ordinary pull request', async () => {
    const ci = await workflowManagedFiles[0].render?.('.');

    expect(ci).toContain(
      `      - name: Check changesets
        if: github.event_name == 'pull_request' && (github.event.pull_request.head.repo.full_name != github.repository || github.head_ref != 'changeset-release/main')
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

async function createDetachedVersionPackagesCheckout(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-version-packages-');
  temporaryDirectories.push(target);
  await mkdir(join(target, '.changeset'));
  await writeFile(
    join(target, '.changeset/config.json'),
    `${JSON.stringify(
      {
        changelog: false,
        commit: false,
        fixed: [],
        linked: [],
        access: 'public',
        baseBranch: 'main',
        updateInternalDependencies: 'patch',
        ignore: [],
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(target, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  await writeFile(
    join(target, '.changeset/release.md'),
    "---\n'fixture': patch\n---\n\nRelease the fixture.\n",
  );
  runGit(target, ['init', '--initial-branch=main']);
  runGit(target, ['config', 'user.email', 'test@example.com']);
  runGit(target, ['config', 'user.name', 'Devtools Test']);
  runGit(target, ['add', '.']);
  runGit(target, ['commit', '-m', 'Add release changeset']);
  const baseCommit = runGit(target, ['rev-parse', 'HEAD']);
  await rm(join(target, '.changeset/release.md'));
  await writeFile(join(target, 'package.json'), '{"name":"fixture","version":"1.0.1"}\n');
  runGit(target, ['add', '.']);
  runGit(target, ['commit', '-m', 'Version Packages']);
  runGit(target, ['update-ref', 'refs/remotes/origin/main', baseCommit]);
  runGit(target, ['checkout', '--detach', 'HEAD']);
  runGit(target, ['branch', '--delete', '--force', 'main']);
  return target;
}

function runGit(target: string, args: readonly string[]): string {
  const result = spawnSync('git', args, { cwd: target, encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr.trim()}`);
  }
  return result.stdout.trim();
}

describe('managed Renovate workflow', () => {
  test('pins the Renovate workflow and passes scoped App credentials', async () => {
    const definition = getRenovateWorkflowDefinition();
    const rendered = await definition.render?.('.');

    expect(rendered).toMatch(
      /ankhorage\/renovate\/\.github\/workflows\/changeset\.yml@[0-9a-f]{40}/u,
    );
    expect(rendered).toContain("github.actor == 'renovate[bot]'");
    expect(rendered).toContain("github.actor == 'ankhorage-renovate-sync[bot]'");
    const template = await readFile(new URL('./files/renovate.yml', import.meta.url), 'utf8');
    expect(template).toContain(
      'ankhorage/renovate/.github/workflows/changeset.yml@d3f138f4e8d3eb84244730f86591c6556738c1f4',
    );
    expect(rendered).toContain('contents: read');
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
