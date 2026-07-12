import { describe, expect, it } from 'bun:test';

import { createKnipConfig } from './tools/knip/index.js';

describe('createKnipConfig', () => {
  it('returns an empty config by default so Knip can use zero-config discovery', () => {
    expect(createKnipConfig()).toEqual({});
  });

  it('uses explicit repo-specific config when provided', () => {
    expect(
      createKnipConfig({
        entry: ['scripts/release.ts'],
        project: ['scripts/**/*.ts'],
        ignore: ['fixtures/**'],
        ignoreBinaries: ['eslint', 'prettier'],
        ignoreDependencies: ['optional-package'],
        ignoreFiles: ['examples/package/prettier.config.cjs'],
      }),
    ).toEqual({
      entry: ['scripts/release.ts'],
      project: ['scripts/**/*.ts'],
      ignore: ['fixtures/**'],
      ignoreBinaries: ['eslint', 'prettier'],
      ignoreDependencies: ['optional-package'],
      ignoreFiles: ['examples/package/prettier.config.cjs'],
    });
  });
});
