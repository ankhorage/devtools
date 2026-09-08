import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

describe('Renovate sync protocol release metadata', () => {
  test('publishes one positive integer protocol requirement', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { readonly ankhorage?: { readonly renovateSyncProtocol?: unknown } };
    const protocol = packageJson.ankhorage?.renovateSyncProtocol;

    expect(protocol).toBeInteger();
    expect(protocol).toBeGreaterThan(0);
  });
});
