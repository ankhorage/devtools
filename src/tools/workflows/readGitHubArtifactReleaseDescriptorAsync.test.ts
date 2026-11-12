import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { readGitHubArtifactReleaseDescriptorAsync } from './readGitHubArtifactReleaseDescriptorAsync.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) => await rm(directory, { force: true, recursive: true })),
  );
});

test('reads an explicit artifact-only descriptor without using package identity', async () => {
  const directory = await createDescriptorFixtureAsync({
    assetName: 'plugin.zip',
    assetPath: 'dist/plugin.zip',
    buildCommand: ['python3', 'build.py'],
    kind: 'github-artifact',
    requiredChecks: ['CI'],
    verifyCommand: ['python3', 'check.py'],
    versionCommand: ['python3', 'version.py'],
  });

  expect(readGitHubArtifactReleaseDescriptorAsync(directory)).resolves.toEqual({
    assetName: 'plugin.zip',
    assetPath: 'dist/plugin.zip',
    buildCommand: "'python3' 'build.py'",
    requiredChecks: '["CI"]',
    verifyCommand: "'python3' 'check.py'",
    versionCommand: "'python3' 'version.py'",
  });
});

test('rejects path traversal and executable shell syntax in artifact descriptors', async () => {
  const directory = await createDescriptorFixtureAsync({
    assetName: '../plugin.zip',
    assetPath: '../plugin.zip',
    buildCommand: 'python3 build.py',
    kind: 'github-artifact',
    requiredChecks: ['CI'],
    verifyCommand: [],
    versionCommand: ['sh', '-c', 'echo 1.0.0'],
  });

  expect(readGitHubArtifactReleaseDescriptorAsync(directory)).rejects.toThrow(
    'buildCommand must be a non-empty array of command arguments',
  );
});

/*** Create one checked-in descriptor fixture without requiring a package manifest or Changesets. */
async function createDescriptorFixtureAsync(descriptor: unknown): Promise<string> {
  const directory = await mkdtemp('/tmp/devtools-artifact-release-');
  directories.push(directory);
  await mkdir(join(directory, '.ankh'), { recursive: true });
  await writeFile(
    join(directory, '.ankh/release-distribution.json'),
    `${JSON.stringify(descriptor)}\n`,
  );
  return directory;
}
