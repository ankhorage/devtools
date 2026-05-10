import { describe, expect, it } from 'bun:test';

import { createKnipConfig, defaultKnipProject } from './knip.js';

describe('createKnipConfig', () => {
  it('returns the shared default Knip config', () => {
    const config = createKnipConfig();

    expect(config.project).toEqual([...defaultKnipProject]);
    expect(config.entry).toBeUndefined();
    expect(config.ignore).toBeUndefined();
  });

  it('appends repo-specific project config without replacing shared defaults', () => {
    const config = createKnipConfig({
      entry: ['scripts/release.ts'],
      project: ['scripts/**/*.ts'],
      ignore: ['fixtures/**'],
      ignoreDependencies: ['optional-package'],
    });

    expect(config.entry).toEqual(['scripts/release.ts']);
    expect(config.project).toContain('src/**/*.{ts,tsx,js,jsx}');
    expect(config.project).toContain('scripts/**/*.ts');
    expect(config.ignore).toEqual(['fixtures/**']);
    expect(config.ignoreDependencies).toEqual(['optional-package']);
  });
});
