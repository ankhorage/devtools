import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

const WORKFLOW_ROOT = join(process.cwd(), 'workflows');

describe('shared workflow templates', () => {
  it('provides a CI workflow using the canonical Bun version', () => {
    const content = readFileSync(join(WORKFLOW_ROOT, 'ci.yml'), 'utf8');

    expect(content).toContain('name: CI');
    expect(content).toContain("bun-version: '1.3.13'");
    expect(content).toContain('bun install --frozen-lockfile');
    expect(content).toContain('bun run lint');
    expect(content).toContain('bun run test');
    expect(content).toContain('bun run typecheck');
  });

  it('provides a release workflow using the canonical Bun version', () => {
    const content = readFileSync(join(WORKFLOW_ROOT, 'release.yml'), 'utf8');

    expect(content).toContain('name: Release');
    expect(content).toContain("bun-version: '1.3.13'");
    expect(content).toContain('uses: changesets/action@v1');
    expect(content).toContain('bun run version-packages');
    expect(content).toContain('bunx changeset publish');
  });
});
