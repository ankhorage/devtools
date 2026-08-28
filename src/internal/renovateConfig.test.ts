import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'bun:test';

describe('Renovate configuration', () => {
  test('activates the Devtools owner profile and targets only the Bun authority', async () => {
    const config = await readFile(new URL('../../renovate.json5', import.meta.url), 'utf8');

    expect(config).toContain('github>ankhorage/renovate:devtools-owner');
    expect(config).toContain("managerFilePatterns: ['/^src\\\\/policy\\\\/bunRuntimePolicy");
    expect(config).toContain("matchManagers: ['custom.regex']");
    expect(config).toContain("matchDepNames: ['bun']");
    expect(config).toContain('Devtools-owned toolchain');
    expect(config).toContain('automerge: false');
    expect(config).toContain("matchUpdateTypes: ['major']");
  });
});
