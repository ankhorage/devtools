import { describe, expect, test } from 'bun:test';

import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import { changesetsPolicy } from '../../policy/changesetsPolicy.js';
import { workflowManagedFiles } from './index.js';

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
    expect(changesetsPolicy.workflowCommands.versionPackagesStatus).not.toContain('--since');
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

describe('managed Renovate workflow', () => {
  test('pins the Renovate Changeset workflow and dispatches CI', async () => {
    const definition = workflowManagedFiles.find(
      ({ relativePath }) => relativePath === '.github/workflows/renovate.yml',
    );
    const rendered = await definition?.render?.('.');

    expect(rendered).toContain(
      'ankhorage/renovate/.github/workflows/changeset.yml@7d4a5104b94e763ca5be34919f4fcfbb12efd526',
    );
    expect(rendered).toContain("github.actor == 'renovate[bot]'");
    expect(rendered).toContain('actions: write');

    const ci = await workflowManagedFiles[0].render?.('.');
    expect(ci).toContain('workflow_dispatch:');
  });
});
