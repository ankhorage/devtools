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
    requiredChecks: ['CI / validate'],
    requiredWorkflow: '.github/workflows/ci.yml',
    verifyCommand: ['python3', 'check.py'],
    versionCommand: ['python3', 'version.py'],
  });

  expect(readGitHubArtifactReleaseDescriptorAsync(directory)).resolves.toEqual({
    assetName: 'plugin.zip',
    assetPath: 'dist/plugin.zip',
    buildCommand: ['python3', 'build.py'],
    requiredChecks: ['CI / validate'],
    requiredWorkflow: '.github/workflows/ci.yml',
    verifyCommand: ['python3', 'check.py'],
    versionCommand: ['python3', 'version.py'],
  });
});

test('rejects path traversal and executable shell syntax in artifact descriptors', async () => {
  const directory = await createDescriptorFixtureAsync({
    assetName: '../plugin.zip',
    assetPath: '../plugin.zip',
    buildCommand: 'python3 build.py',
    kind: 'github-artifact',
    requiredChecks: ['CI'],
    requiredWorkflow: '.github/workflows/ci.yml',
    verifyCommand: [],
    versionCommand: ['sh', '-c', 'echo 1.0.0'],
  });

  expect(readGitHubArtifactReleaseDescriptorAsync(directory)).rejects.toThrow(
    'buildCommand must be a non-empty array of command arguments',
  );
});

test.each([
  ['assetPath', 'dist/plugin\n.zip'],
  ['assetName', 'plugin\n.zip'],
])('rejects descriptor injection in %s', async (field, value) => {
  const directory = await createDescriptorFixtureAsync({
    assetName: 'plugin.zip',
    assetPath: 'dist/plugin.zip',
    buildCommand: ['node', '-e', 'process.exit(0)'],
    kind: 'github-artifact',
    requiredChecks: ['validate'],
    requiredWorkflow: '.github/workflows/ci.yml',
    verifyCommand: ['node', '-e', 'process.exit(0)'],
    versionCommand: ['node', '-e', 'console.log("1.0.0")'],
    [field]: value,
  });

  expect(readGitHubArtifactReleaseDescriptorAsync(directory)).rejects.toThrow();
});

test.each(['ci.yml', '.github/workflows/../ci.yml', '.github/workflows/ci.txt'])(
  'rejects an unsafe required workflow path: %s',
  async (requiredWorkflow) => {
    const directory = await createDescriptorFixtureAsync({
      assetName: 'plugin.zip',
      assetPath: 'dist/plugin.zip',
      buildCommand: ['node', '-e', 'process.exit(0)'],
      kind: 'github-artifact',
      requiredChecks: ['validate'],
      requiredWorkflow,
      verifyCommand: ['node', '-e', 'process.exit(0)'],
      versionCommand: ['node', '-e', 'console.log("1.0.0")'],
    });

    expect(readGitHubArtifactReleaseDescriptorAsync(directory)).rejects.toThrow(
      'requiredWorkflow must name one GitHub Actions workflow file',
    );
  },
);

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
