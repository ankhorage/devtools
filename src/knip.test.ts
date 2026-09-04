import { describe, expect, it } from 'bun:test';

import { createKnipConfig, createKnipMonorepoConfig } from './tools/knip/index.js';

describe('createKnipConfig', () => {
  it('keeps zero-config discovery by default', () => {
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

describe('createKnipMonorepoConfig', () => {
  it('keeps workspace topology defaults', () => {
    expect(createKnipMonorepoConfig()).toMatchObject({
      workspaces: {
        '.': {},
        'packages/*': {},
        'apps/*': {},
      },
    });
  });
});
