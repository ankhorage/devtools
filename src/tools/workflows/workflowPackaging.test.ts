import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { expect, test } from 'bun:test';

test('packs managed assets at canonical paths when TypeScript already emitted workflow files', () => {
  const manifest = JSON.parse(
    readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
  ) as { readonly scripts: { readonly build: string } };
  const commands = manifest.scripts.build
    .split('&&')
    .map((command) => command.trim())
    .filter((command) => command.startsWith('cp '));
  const directory = mkdtempSync(join(tmpdir(), 'ankhorage-devtools-build-'));
  const fixtures = [
    ['src/tools/prettier/index.cjs', 'dist/tools/prettier/index.cjs'],
    ['src/tools/workflows/files/ci.yml', 'dist/tools/workflows/files/ci.yml'],
    ['src/tools/workflows/files/release.yml', 'dist/tools/workflows/files/release.yml'],
    ['src/tools/workflows/files/renovate.yml', 'dist/tools/workflows/files/renovate.yml'],
    ['src/tools/vscode/files/settings.json', 'dist/tools/vscode/files/settings.json'],
    ['src/tools/skills/assets/base/SKILL.md', 'dist/tools/skills/assets/base/SKILL.md'],
  ] as const;

  try {
    for (const [source] of fixtures) {
      mkdirSync(dirname(join(directory, source)), { recursive: true });
      writeFileSync(join(directory, source), source);
    }
    for (const target of ['prettier', 'workflows/files', 'vscode', 'skills']) {
      mkdirSync(join(directory, 'dist/tools', target), { recursive: true });
    }
    writeFileSync(join(directory, 'dist/tools/workflows/files/ci-impact.js'), 'export {};\n');

    for (const command of commands) execFileSync('sh', ['-c', command], { cwd: directory });

    for (const [source, target] of fixtures)
      expect(readFileSync(join(directory, target), 'utf8')).toBe(source);
    expect(existsSync(join(directory, 'dist/tools/workflows/files/ci-impact.js'))).toBe(true);
    expect(existsSync(join(directory, 'dist/tools/workflows/files/files'))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
