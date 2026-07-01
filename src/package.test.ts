import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

describe('package metadata', () => {
  it('publishes exact Ankh metadata and required scripts without expanding exports', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;

    expect(packageJson.name).toBe('@ankhorage/devtools');
    expect(packageJson.type).toBe('module');
    expect(packageJson.ankh).toEqual({
      category: 'devtools',
      provider: './dist/ankh.provider.js',
      capabilities: ['devtools.lint', 'devtools.format', 'devtools.knip'],
    });

    expect(packageJson.bin).toEqual({
      'ankhorage-eslint': './dist/eslint-cli.js',
      'ankhorage-knip': './dist/knip-cli.js',
      'ankhorage-prettier': './dist/prettier-cli.js',
    });

    expect(packageJson.exports).toEqual({
      './eslint': {
        types: './dist/eslint.d.ts',
        import: './dist/eslint.js',
      },
      './knip': {
        types: './dist/knip.d.ts',
        import: './dist/knip.js',
      },
      './prettier': {
        require: './dist/prettier.cjs',
      },
    });

    const scripts = packageJson.scripts as Record<string, string>;
    expect(Object.keys(scripts).sort()).toEqual(
      [
        'build',
        'changeset',
        'changeset:status',
        'docs',
        'docs:check',
        'format',
        'format:check',
        'knip',
        'lint',
        'lint:fix',
        'test',
        'typecheck',
        'version-packages',
      ].sort(),
    );
  });

  it('documents the provider-backed command surface in the README', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');

    expect(readme).toContain('ankh devtools lint');
    expect(readme).toContain('ankh devtools format');
    expect(readme).toContain('ankh devtools knip');
    expect(readme).toContain('devtools.lint');
    expect(readme).toContain('devtools.format');
    expect(readme).toContain('devtools.knip');
  });
});
