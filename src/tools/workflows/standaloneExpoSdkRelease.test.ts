import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const workflow = readFileSync(new URL('./files/release.yml', import.meta.url), 'utf8');

/*** Execute the release workflow's real Expo SDK selection against a local manifest. */
function selectExpoSdk(dependencies: Readonly<Record<string, string>>): {
  readonly code: number;
  readonly output: string;
  readonly stderr: string;
} {
  const marker = "expo_sdk_specifier=\"$(node - <<'NODE'\n";
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf('\n          NODE\n          )"', start + marker.length);
  if (start < 0 || end < 0) throw new Error('Missing managed Expo SDK selector.');
  const code = workflow.slice(start + marker.length, end)
    .split('\n').map((line) => line.slice(10)).join('\n');
  const directory = mkdtempSync(join(tmpdir(), 'release-expo-'));
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ dependencies }));
    const result = Bun.spawnSync(['node', '-e', code], {
      cwd: directory,
      stdout: 'pipe',
      stderr: 'pipe',
    });
    return {
      code: result.exitCode,
      output: result.stdout.toString(),
      stderr: result.stderr.toString(),
    };
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
}

test('uses the declared Expo 57 generation for ZORA SDK 57 modules', () => {
  expect(selectExpoSdk({
    'expo-document-picker': '~57.0.3',
    'expo-image-picker': '~57.0.20',
  })).toEqual({ code: 0, output: 'expo@~57.0.0', stderr: '' });
});

test('honors an explicit Expo version and rejects conflicting SDK packages', () => {
  expect(selectExpoSdk({
    expo: '57.0.27',
    'expo-image-picker': '~57.0.20',
  })).toEqual({ code: 0, output: 'expo@57.0.27', stderr: '' });
  const conflicting = selectExpoSdk({
    'expo-document-picker': '~57.0.3',
    'expo-image-picker': '~58.0.3',
  });
  expect(conflicting.code).not.toBe(0);
  expect(conflicting.stderr).toContain('Conflicting Expo SDK majors');
});

test('keeps unrelated packages and both packed Expo verification gates', () => {
  expect(selectExpoSdk({ 'expo-router': '~6.0.0' })).toEqual({
    code: 0, output: '', stderr: '',
  });
  expect(workflow).toContain('bun add "$expo_sdk_specifier" --ignore-scripts');
  expect(workflow).toContain('bun add "$expo_sdk_specifier" --ignore-scripts --omit optional');
  expect(workflow).toContain('bun add "$artifact" --ignore-scripts --omit optional');
  expect(workflow).toContain('verify_react_native_export "$optional_install_dir"');
});
