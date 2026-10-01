import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'bun:test';

import { EXAMPLES_ESLINT_OWNERSHIP_MARKER } from './constants/eslint.js';
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

  it('ignores only the Devtools-managed examples ESLint config', () => {
    const target = mkdtempSync(join(tmpdir(), 'devtools-knip-'));
    const originalDirectory = process.cwd();
    const examplesConfig = join(target, 'eslint.examples.config.mjs');
    try {
      writeFileSync(examplesConfig, 'export default [];\n');
      process.chdir(target);
      expect(createKnipConfig()).toEqual({});

      writeFileSync(examplesConfig, `${EXAMPLES_ESLINT_OWNERSHIP_MARKER}export default [];\n`);
      expect(createKnipConfig()).toEqual({ ignoreFiles: ['eslint.examples.config.mjs'] });
      expect(createKnipConfig({ ignoreFiles: ['fixture.ts'] })).toEqual({
        ignoreFiles: ['fixture.ts', 'eslint.examples.config.mjs'],
      });
    } finally {
      process.chdir(originalDirectory);
      rmSync(target, { recursive: true, force: true });
    }
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
