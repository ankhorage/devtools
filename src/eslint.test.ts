import { describe, expect, it } from 'bun:test';

import { createConfig, defaultRestrictedImports } from './tools/eslint/index.js';

describe('createConfig sanity check', () => {
  const baseOptions = {
    tsconfigRootDir: '/root',
    project: ['./tsconfig.json'],
    files: ['src/**/*.ts'],
  };

  it('should return a non-empty config array', () => {
    const config = createConfig(baseOptions);
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('scopes the recommended JavaScript rules to the configured files', () => {
    const config = createConfig(baseOptions);
    const recommendedConfig = config.at(1);

    expect(recommendedConfig?.files).toEqual(baseOptions.files);
  });

  it('reuses compatibility plugin instances for overlapping React configurations', () => {
    const first = createConfig({ ...baseOptions, profile: 'react-native' });
    const second = createConfig({
      ...baseOptions,
      files: ['src/**/*.ts', 'test/**/*.ts'],
      profile: 'react-native',
    });

    for (const plugin of ['react-hooks', 'react-native'] as const) {
      const left = first.find((entry) => entry.plugins?.[plugin] !== undefined)?.plugins?.[plugin];
      const right = second.find((entry) => entry.plugins?.[plugin] !== undefined)?.plugins?.[plugin];
      expect(left).toBeDefined();
      expect(right).toBe(left);
    }
  });

  it('allows the owning Studio DnD package and rejects only the upstream package', () => {
    expect(defaultRestrictedImports).toEqual([
      {
        name: 'react-native-reanimated-dnd',
        message:
          "Forbidden in Ankhorage packages. Use '@ankhorage/react-native-reanimated-dnd-web' directly.",
      },
    ]);

    const serializedRules = JSON.stringify(defaultRestrictedImports);
    expect(serializedRules).toContain('@ankhorage/react-native-reanimated-dnd-web');
    expect(serializedRules).not.toContain('@ankh/dnd');
  });
});
