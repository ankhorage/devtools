import { describe, expect, it } from 'bun:test';

import { createConfig } from './eslint.js';

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
});
