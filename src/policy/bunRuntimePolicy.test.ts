import { readFile } from 'node:fs/promises';

import { describe, expect, test } from 'bun:test';

import { bunRuntimePolicy } from './bunRuntimePolicy.js';

describe('Bun runtime policy', () => {
  test('derives every public value from one canonical version literal', async () => {
    const source = await readFile(new URL('./bunRuntimePolicy.ts', import.meta.url), 'utf8');
    const matches = source.match(/const BUN_VERSION = '\d+\.\d+\.\d+';/gu);

    expect(matches).toHaveLength(1);
    expect(bunRuntimePolicy.packageManager).toBe(`bun@${bunRuntimePolicy.version}`);
    expect(bunRuntimePolicy.typesRange).toBe(`^${bunRuntimePolicy.version}`);
    expect(source.split(bunRuntimePolicy.version)).toHaveLength(2);
  });
});
