import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'bun:test';

const capabilities = [
  'devtools.changeset',
  'devtools.lint',
  'devtools.format',
  'devtools.knip',
  'devtools.sync',
  'devtools.status',
  'devtools.eslint.sync',
  'devtools.eslint.status',
  'devtools.prettier.sync',
  'devtools.prettier.status',
  'devtools.knip.sync',
  'devtools.knip.status',
  'devtools.package.sync',
  'devtools.package.status',
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
      'ankhorage-changeset': './dist/cli/bin/changeset.js',
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
      './policy': {
        types: './dist/policy/bunRuntimePolicy.d.ts',
        import: './dist/policy/bunRuntimePolicy.js',
      },
      './prettier': {
        import: './dist/tools/prettier/index.cjs',
        require: './dist/tools/prettier/index.cjs',
        default: './dist/tools/prettier/index.cjs',
      },
    });

    const { build } = packageJson.scripts as Record<string, string>;
    expect(build).toContain('src/tools/workflows/files');
    expect(build).toContain('dist/tools/workflows/files');
    expect(build).toContain('src/tools/vscode/files');
    expect(build).toContain('dist/tools/vscode/files');
    expect(build).toContain('src/tools/prettier/index.cjs');
    expect(build).toContain('dist/tools/prettier/index.cjs');
    expect(packageJson.scripts).toMatchObject({ 'knip:check': 'knip' });
    expect(packageJson.scripts).not.toHaveProperty('knip');
    expect(existsSync(new URL('../bun.lock', import.meta.url))).toBe(true);
    expect(existsSync(new URL('../package-lock.json', import.meta.url))).toBe(false);
  });
});

describe('package release contract', () => {
  it('owns Changesets through the source runner and published dependency', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as Record<string, Record<string, unknown>>;

    expect(packageJson.scripts).toMatchObject({
      changeset: 'bun src/cli/bin/changeset.ts',
      'changeset:status': 'bun src/cli/bin/changeset.ts status --since=origin/main',
      'version-packages': 'bun src/cli/bin/changeset.ts version',
    });
    expect(packageJson.dependencies).toMatchObject({ '@changesets/cli': '^2.31.1' });
    expect(packageJson.devDependencies).not.toHaveProperty('@changesets/cli');
  });

  it('ships every canonical managed asset in the source tree', () => {
    expect(existsSync(new URL('./tools/workflows/files/ci.yml', import.meta.url))).toBe(true);
    expect(existsSync(new URL('./tools/workflows/files/release.yml', import.meta.url))).toBe(true);
    expect(existsSync(new URL('./tools/vscode/files/settings.json', import.meta.url))).toBe(true);
    expect(existsSync(new URL('./tools/vscode/files/extensions.json', import.meta.url))).toBe(true);
  });

  it('documents only the canonical devtools command surface', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    for (const capability of capabilities) {
      expect(readme).toContain(capability);
    }
    expect(readme).toContain('ankh devtools sync');
    expect(readme).toContain('ankh devtools changeset');
    expect(readme).toContain('ankhorage-changeset');
    expect(readme).toContain('ankh devtools workflows sync');
    expect(readme).toContain('ankh devtools vscode sync');
    expect(readme).not.toContain('ankh dev ');
    expect(readme).not.toContain('`@ankhorage/dev`');
  });
});
