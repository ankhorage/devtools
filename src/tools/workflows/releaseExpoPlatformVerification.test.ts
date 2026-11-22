import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('managed React Native fallback materializes a standalone Expo package', async () => {
  const release = await renderReleaseWorkflowAsync();
  const source = extractExpoFallbackSource(release);
  const directory = await mkdtemp('/tmp/devtools-release-expo-');
  temporaryDirectories.push(directory);
  const command = [
    `APP_DIR=${JSON.stringify(directory)} PACKAGE_SPECIFIER='@example/packed' PLATFORM_TOOLCHAIN_DEPENDENCIES='{}' node - <<'NODE'`,
    source,
    'NODE',
  ].join('\n');
  const child = Bun.spawn(['sh', '-c', command], {
    cwd: directory,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);

  expect(exitCode).toBe(0);
  expect(stderr).toBe('');
  await expectExpoPackageFilesAsync(directory);
});

test('managed React Native fallback derives the DOM Metro runtime from installed Expo metadata', async () => {
  const release = await renderReleaseWorkflowAsync();
  const source = extractExpoMetroRuntimeSource(release);
  const directory = await mkdtemp('/tmp/devtools-release-expo-metro-');
  temporaryDirectories.push(directory);
  await Bun.write(
    join(directory, 'package.json'),
    JSON.stringify({
      peerDependencies: { '@expo/metro-runtime': '*' },
    }),
  );
  await Bun.write(
    join(directory, 'bundledNativeModules.json'),
    JSON.stringify({ '@expo/metro-runtime': '~99.1.2' }),
  );
  const command = [
    `mkdir -p node_modules/expo && cp package.json node_modules/expo/package.json && cp bundledNativeModules.json node_modules/expo/bundledNativeModules.json && node - <<'NODE'`,
    source,
    'NODE',
  ].join('\n');
  const child = Bun.spawn(['sh', '-c', command], {
    cwd: directory,
    env: process.env,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);

  expect(exitCode).toBe(0);
  expect(stdout).toBe('@expo/metro-runtime@~99.1.2');
  expect(stderr).toBe('');
  expect(release).not.toContain('bun add "@expo/dom-webview"');
});

/*** Render the managed release workflow used as the executable probe source. */
async function renderReleaseWorkflowAsync(): Promise<string> {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }
  const directory = await mkdtemp('/tmp/devtools-release-workflow-');
  temporaryDirectories.push(directory);
  await mkdir(join(directory, '.changeset'));
  await writeFile(join(directory, '.changeset', 'config.json'), '{}\n');
  return releaseDefinition.render(directory);
}

/*** Extract the Expo fallback heredoc from the rendered release workflow. */
function extractExpoFallbackSource(release: string): string {
  const match =
    /APP_DIR="\$platform_dir" PACKAGE_SPECIFIER="\$specifier"(?: PLATFORM_TOOLCHAIN_DEPENDENCIES="\$platform_toolchain_dependencies")? node - <<'NODE'\n(?<source>[\s\S]*?)\n +NODE/u.exec(
      release,
    );
  const source = match?.groups?.source;
  if (source === undefined) throw new Error('Missing packed Expo fallback source.');
  return source;
}

/*** Extract the Expo-owned DOM runtime resolver from the rendered release workflow. */
function extractExpoMetroRuntimeSource(release: string): string {
  const match =
    /metro_runtime_dependency="\$\(node - <<'NODE'\n(?<source>[\s\S]*?)\n +NODE\n +\)"/u.exec(
      release,
    );
  const source = match?.groups?.source;
  if (source === undefined) throw new Error('Missing packed Expo Metro runtime source.');
  return source
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

/*** Assert the fallback materializes the standalone Expo app files required by Expo CLI. */
async function expectExpoPackageFilesAsync(directory: string): Promise<void> {
  const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as unknown;
  expect(manifest).toMatchObject({
    main: './App.tsx',
    name: 'packed-platform-verification',
    private: true,
    version: '0.0.0',
  });
  expect(await readFile(join(directory, 'App.tsx'), 'utf8')).toBe(
    'export * from "@example/packed";\n',
  );
}
