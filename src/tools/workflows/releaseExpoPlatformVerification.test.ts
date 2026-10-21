import { mkdtemp, readFile, rm } from 'node:fs/promises';
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
    `APP_DIR=${JSON.stringify(directory)} PACKAGE_SPECIFIER='@example/packed' node - <<'NODE'`,
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

/*** Render the managed release workflow used as the executable probe source. */
async function renderReleaseWorkflowAsync(): Promise<string> {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }
  return releaseDefinition.render('.');
}

/*** Extract the Expo fallback heredoc from the rendered release workflow. */
function extractExpoFallbackSource(release: string): string {
  const match =
    /APP_DIR="\$platform_dir" PACKAGE_SPECIFIER="\$specifier" node - <<'NODE'\n(?<source>[\s\S]*?)\n {10}NODE/u.exec(
      release,
    );
  const source = match?.groups?.source;
  if (source === undefined) throw new Error('Missing packed Expo fallback source.');
  return source;
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
