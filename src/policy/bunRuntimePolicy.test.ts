import { SEMVER_PATTERNS } from '@ankhorage/utility/semver';
import { describe, expect, test } from 'bun:test';

import { bunRuntimePolicy } from './bunRuntimePolicy.js';

describe('Bun runtime policy', () => {
  test('keeps the runtime and published Bun types on independent canonical versions', () => {
    expect(bunRuntimePolicy.version).toMatch(SEMVER_PATTERNS.exact);
    expect(bunRuntimePolicy.packageManager).toBe(`bun@${bunRuntimePolicy.version}`);
    expect(bunRuntimePolicy.typesRange).toMatch(SEMVER_PATTERNS.caret);
  });
});
