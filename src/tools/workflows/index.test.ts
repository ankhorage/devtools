import { describe, expect, test } from 'bun:test';

import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
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
    }
  });

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
