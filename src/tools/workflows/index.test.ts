import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { getDevtoolsToolCommand } from '../../cli/commands.js';
import { runExternalTool } from '../../cli/runExternalTool.js';
import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import { changesetsPolicy } from '../../policy/changesetsPolicy.js';
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
    expect(release).not.toContain('bunx changeset');
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
    const definition = workflowManagedFiles.find(
      ({ relativePath }) => relativePath === '.github/workflows/renovate.yml',
    );
    const rendered = await definition?.render?.('.');

    expect(rendered).toContain(
      'ankhorage/renovate/.github/workflows/changeset.yml@4deba0b1e900c4fa9886b76cc0a0fee55df0f4aa',
    );
    expect(rendered).toContain("github.actor == 'renovate[bot]'");
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
