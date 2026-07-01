import { describe, expect, it } from 'bun:test';

import { createKnipConfig } from './knip.js';

describe('createKnipConfig', () => {
  it('returns an empty config by default so Knip can use zero-config discovery', () => {
    const config = createKnipConfig();

    expect(config).toEqual({});
  });

  it('uses explicit repo-specific config when provided', () => {
    const config = createKnipConfig({
      entry: ['scripts/release.ts'],
      project: ['scripts/**/*.ts'],
      ignore: ['fixtures/**'],
      ignoreBinaries: ['eslint', 'prettier'],
      ignoreDependencies: ['optional-package'],
      ignoreFiles: ['examples/package/prettier.config.cjs'],
    });

    expect(config).toEqual({
      entry: ['scripts/release.ts'],
      project: ['scripts/**/*.ts'],
      ignore: ['fixtures/**'],
      ignoreBinaries: ['eslint', 'prettier'],
      ignoreDependencies: ['optional-package'],
      ignoreFiles: ['examples/package/prettier.config.cjs'],
    });
  });
});
