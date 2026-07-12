import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

const capabilities = [
  'devtools.lint',
  'devtools.format',
  'devtools.knip',
  'devtools.sync',
  'devtools.status',
  'devtools.workflows.sync',
  'devtools.workflows.status',
  'devtools.vscode.sync',
  'devtools.vscode.status',
];

describe('package metadata', () => {
  it('publishes the canonical provider, binaries, exports, and managed assets', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as Record<string, unknown>;

    expect(packageJson.name).toBe('@ankhorage/devtools');
    expect(packageJson.type).toBe('module');
    expect(packageJson.ankh).toEqual({
      category: 'devtools',
      provider: './dist/cli/index.js',
      capabilities,
    });
    expect(packageJson.bin).toEqual({
      'ankhorage-eslint': './dist/cli/bin/eslint.js',
      'ankhorage-knip': './dist/cli/bin/knip.js',
      'ankhorage-prettier': './dist/cli/bin/prettier.js',
    });
    expect(packageJson.exports).toEqual({
      './cli': {
        types: './dist/cli/index.d.ts',
        import: './dist/cli/index.js',
      },
      './eslint': {
        types: './dist/tools/eslint/index.d.ts',
        import: './dist/tools/eslint/index.js',
      },
      './knip': {
        types: './dist/tools/knip/index.d.ts',
        import: './dist/tools/knip/index.js',
      },
      './prettier': {
        require: './dist/tools/prettier/index.cjs',
      },
    });

    const build = (packageJson.scripts as Record<string, string>).build;
    expect(build).toContain('src/tools/workflows/files');
    expect(build).toContain('src/tools/vscode/files');
    expect(build).toContain('src/tools/prettier/index.cjs');
  });

  it('resolves managed assets from the built package after build', () => {
    expect(existsSync(new URL('../dist/tools/workflows/files/ci.yml', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../dist/tools/workflows/files/release.yml', import.meta.url))).toBe(
      true,
    );
    expect(existsSync(new URL('../dist/tools/vscode/files/settings.json', import.meta.url))).toBe(
      true,
    );
    expect(existsSync(new URL('../dist/tools/vscode/files/extensions.json', import.meta.url))).toBe(
      true,
    );
  });

  it('documents only the canonical devtools command surface', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    for (const capability of capabilities) {
      expect(readme).toContain(capability);
    }
    expect(readme).toContain('ankh devtools sync');
    expect(readme).toContain('ankh devtools workflows sync');
    expect(readme).toContain('ankh devtools vscode sync');
    expect(readme).not.toContain('ankh dev ');
    expect(readme).not.toContain('`@ankhorage/dev`');
  });
});
