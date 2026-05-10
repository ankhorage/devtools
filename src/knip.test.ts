import { describe, expect, it } from 'bun:test';

import { createKnipConfig, defaultKnipEntry, defaultKnipIgnores, defaultKnipProject } from './knip.js';

describe('createKnipConfig', () => {
  it('returns the shared default Knip config', () => {
    const config = createKnipConfig();

    expect(config.entry).toEqual([...defaultKnipEntry]);
    expect(config.project).toEqual([...defaultKnipProject]);
    expect(config.ignore).toEqual([...defaultKnipIgnores]);
  });

  it('appends repo-specific config without replacing shared defaults', () => {
    const config = createKnipConfig({
      entry: ['scripts/release.ts'],
      project: ['scripts/**/*.ts'],
      ignore: ['fixtures/**'],
      ignoreDependencies: ['optional-package'],
    });

    expect(config.entry).toContain('src/index.{ts,tsx,js,jsx}');
    expect(config.entry).toContain('scripts/release.ts');
    expect(config.project).toContain('src/**/*.{ts,tsx,js,jsx}');
    expect(config.project).toContain('scripts/**/*.ts');
    expect(config.ignore).toContain('dist/**');
    expect(config.ignore).toContain('fixtures/**');
    expect(config.ignoreDependencies).toEqual(['optional-package']);
  });
});
