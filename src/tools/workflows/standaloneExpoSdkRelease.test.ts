import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

const workflow = readFileSync(new URL('./files/release.yml', import.meta.url), 'utf8');

/*** Execute the release workflow's real platform toolchain selection against a local manifest. */
function selectExpoToolchain(manifest: {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
}): {
  readonly code: number;
  readonly output: string;
  readonly stderr: string;
} {
  const marker = "platform_toolchain_dependencies=\"$(node - <<'NODE'\n";
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf('\n          NODE\n          )"', start + marker.length);
  if (start < 0 || end < 0) throw new Error('Missing managed Expo platform toolchain selector.');
  const code = workflow
    .slice(start + marker.length, end)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  const directory = mkdtempSync(join(tmpdir(), 'release-expo-'));
  try {
    writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest));
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

/*** Execute the release workflow's React Native verification dependency selection against a resolved version. */
function selectReactNativeVerificationDependencies(version: string): {
  readonly code: number;
  readonly output: string;
  readonly stderr: string;
} {
  const marker = "react_native_verification_dependencies=\"$(node - <<'NODE'\n";
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf('\n          NODE\n                  )"', start + marker.length);
  if (start < 0 || end < 0)
    throw new Error('Missing React Native verification dependency selector.');
  const code = workflow
    .slice(start + marker.length, end)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
  const directory = mkdtempSync(join(tmpdir(), 'release-react-native-cli-'));
  try {
    mkdirSync(join(directory, 'node_modules', 'react-native'), { recursive: true });
    writeFileSync(
      join(directory, 'node_modules', 'react-native', 'package.json'),
      JSON.stringify({ version }),
    );
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

test('uses the declared Expo 57 generation and React Native contract for ZORA SDK 57 modules', () => {
  expect(
    selectExpoToolchain({
      dependencies: {
        'expo-document-picker': '~57.0.3',
        'expo-image-picker': '~57.0.20',
      },
      peerDependencies: { react: '19.2.3', 'react-native': '0.86.x' },
    }),
  ).toEqual({
    code: 0,
    output: '{"expo":"~57.0.0","react":"19.2.3","react-native":"0.86.x"}',
    stderr: '',
  });
});

test('uses an all-optional Expo Runtime platform contract and rejects conflicting SDK packages', () => {
  expect(
    selectExpoToolchain({
      peerDependencies: {
        expo: '57.0.33',
        'expo-image-picker': '~57.0.20',
        react: '19.2.3',
        'react-native': '0.86.3',
      },
    }),
  ).toEqual({
    code: 0,
    output: '{"expo":"57.0.33","react":"19.2.3","react-native":"0.86.3"}',
    stderr: '',
  });
  const conflicting = selectExpoToolchain({
    peerDependencies: {
      'expo-document-picker': '~57.0.3',
      'expo-image-picker': '~58.0.3',
      react: '19.2.3',
      'react-native': '0.86.x',
    },
  });
  expect(conflicting.code).not.toBe(0);
  expect(conflicting.stderr).toContain('Conflicting Expo SDK majors');
  expect(conflicting.stderr).toContain('peerDependencies.expo-document-picker=~57.0.3');
  expect(conflicting.stderr).toContain('peerDependencies.expo-image-picker=~58.0.3');
  const conflictingExpo = selectExpoToolchain({
    dependencies: { expo: '57.0.33' },
    peerDependencies: { expo: '58.0.0', react: '19.2.3', 'react-native': '0.86.x' },
  });
  expect(conflictingExpo.code).not.toBe(0);
  expect(conflictingExpo.stderr).toContain('dependencies.expo=57.0.33');
  expect(conflictingExpo.stderr).toContain('peerDependencies.expo=58.0.0');
});

test('uses a bounded SDK-aligned Expo Router platform contract', () => {
  expect(
    selectExpoToolchain({
      peerDependencies: {
        'expo-router': '>=57.0.0 <58.0.0',
        react: '19.2.3',
        'react-native': '0.86.x',
      },
    }),
  ).toEqual({
    code: 0,
    output: '{"expo":"~57.0.0","react":"19.2.3","react-native":"0.86.x"}',
    stderr: '',
  });
});

test('uses Surface published React Native contract without inventing Expo', () => {
  expect(
    selectExpoToolchain({
      peerDependencies: {
        react: '19.2.3 || 19.3.0',
        'react-native': '0.86.x || 0.87.x || 0.88.x',
      },
    }),
  ).toEqual({
    code: 0,
    output: '{"react":"19.2.3 || 19.3.0","react-native":"0.86.x || 0.87.x || 0.88.x"}',
    stderr: '',
  });
});

test('selects the compatible temporary community CLI for React Native 0.81 through 0.88', () => {
  expect(selectReactNativeVerificationDependencies('0.88.1')).toEqual({
    code: 0,
    output: '@react-native-community/cli@^20.0.0\n@react-native/metro-config@0.88.1',
    stderr: '',
  });
});

test('fails closed when the resolved React Native version has no declared community CLI contract', () => {
  const result = selectReactNativeVerificationDependencies('0.89.0');
  expect(result.code).not.toBe(0);
  expect(result.stderr).toContain('supports resolved React Native 0.81 through 0.88');
});

test('keeps unrelated packages and both packed Expo verification gates', () => {
  expect(selectExpoToolchain({ dependencies: { 'expo-router': '~6.0.0' } })).toEqual({
    code: 0,
    output: '',
    stderr: '',
  });
  expect(workflow).toContain('bun add "$artifact" --ignore-scripts --omit optional');
  expect(workflow).toContain('PLATFORM_TOOLCHAIN_DEPENDENCIES="$platform_toolchain_dependencies"');
  expect(workflow).toContain('bun install --ignore-scripts');
  expect(workflow).toContain('bun add "$artifact" --ignore-scripts');
  expect(workflow).toContain('"$platform_dir/node_modules/.bin/expo" export');
  expect(workflow).toContain('react_native_verification_dependencies');
  expect(workflow).toContain("require('@react-native/metro-config')");
  expect(workflow).toContain('"$platform_dir/node_modules/.bin/react-native" bundle');
  expect(workflow).toContain('verify_react_native_export "$optional_install_dir"');
});
