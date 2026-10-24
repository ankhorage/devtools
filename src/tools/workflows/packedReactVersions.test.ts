import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

test('managed standalone release installs a matching React DOM for its actual React peer', async () => {
  const [source, deployed] = await Promise.all([
    readFile(join(import.meta.dir, 'files/release.yml'), 'utf8'),
    readFile(join(import.meta.dir, '../../../.github/workflows/release.yml'), 'utf8'),
  ]);
  for (const workflow of [source, deployed]) {
    expect(workflow).toContain('Verify standalone packed install');
    expect(workflow).toContain('node_modules/react/package.json');
    expect(workflow).toContain('node_modules/react-dom/package.json');
    expect(workflow).toContain('if [ "$react_version" != "$react_dom_version" ]; then');
    expect(workflow).toContain('bun add "react-dom@$react_version" --ignore-scripts');
  }
});
