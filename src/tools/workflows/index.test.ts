import { describe, expect, test } from 'bun:test';

import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy';
import { workflowManagedFiles } from './index';

describe('managed workflows', () => {
  test('render the canonical Bun and Node runtime policies', async () => {
    for (const definition of workflowManagedFiles) {
      expect(definition.render).toBeDefined();
      const rendered = await definition.render?.('.');
      expect(rendered).toContain(`bun-version: '${bunRuntimePolicy.version}'`);
      expect(rendered).toContain(`node-version: '${nodeRuntimePolicy.setupVersion}'`);
      expect(rendered).not.toContain('__ANKH_BUN_VERSION__');
      expect(rendered).not.toContain('__ANKH_NODE_VERSION__');
    }
  });
});
