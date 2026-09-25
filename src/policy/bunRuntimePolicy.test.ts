import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'bun:test';

import { bunRuntimePolicy } from './bunRuntimePolicy.js';

describe('Bun runtime policy', () => {
  test('keeps the runtime and published Bun types on independent canonical versions', async () => {
    const source = await readFile(new URL('./bunRuntimePolicy.ts', import.meta.url), 'utf8');
    const runtimeMatches = source.match(/const BUN_VERSION = '\d+\.\d+\.\d+';/gu);
    const typesMatches = source.match(/const BUN_TYPES_VERSION = '\d+\.\d+\.\d+';/gu);

    expect(runtimeMatches).toHaveLength(1);
    expect(typesMatches).toHaveLength(1);
    expect(bunRuntimePolicy.packageManager).toBe(`bun@${bunRuntimePolicy.version}`);
    expect(bunRuntimePolicy.typesRange).toMatch(/^\^\d+\.\d+\.\d+$/u);
  });
});
