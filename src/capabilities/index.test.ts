import { readFileSync } from 'node:fs';

import { areCapabilitiesEqual, isCapability } from '@ankhorage/contracts/capabilities';
import { describe, expect, it } from 'bun:test';

import { CAPABILITIES } from './index.js';

describe('Devtools capabilities', () => {
  it('publishes valid unique canonical descriptors', () => {
    expect(CAPABILITIES.every(isCapability)).toBeTrue();
    expect(new Set(CAPABILITIES.map(({ id }) => id)).size).toBe(CAPABILITIES.length);
  });

  it('keeps package metadata aligned with the source catalog', () => {
    const parsed: unknown = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    );
    if (!isRecord(parsed)) throw new Error('package.json must contain a JSON object.');

    const { ankh } = parsed;
    if (!isRecord(ankh)) throw new Error('package.json ankh metadata must be an object.');

    const { capabilities } = ankh;
    if (!Array.isArray(capabilities)) {
      throw new Error('package.json ankh.capabilities must be an array.');
    }
    const publishedCapabilities: readonly unknown[] = capabilities;

    expect(publishedCapabilities).toHaveLength(CAPABILITIES.length);
    expect(publishedCapabilities.every(isCapability)).toBeTrue();
    for (const [index, capability] of CAPABILITIES.entries()) {
      const published = publishedCapabilities.at(index);
      expect(isCapability(published)).toBeTrue();
      if (!isCapability(published)) continue;
      expect(areCapabilitiesEqual(published, capability)).toBeTrue();
    }
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
