import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map(async (directory) => await rm(directory, { force: true, recursive: true })),
  );
});

test('renders an artifact-only lane for a private non-npm consumer', async () => {
  const release = await renderArtifactReleaseAsync();

  expect(release).toContain("candidate_version=\"$('python3' 'version.py')\"");
  expect(release).toContain("'python3' 'build.py'");
  expect(release).toContain("'python3' 'verify.py'");
  expect(release).toContain('asset_name=plugin.zip');
  expect(release).toContain('sha256sum "${RUNNER_TEMP}/plugin.zip"');
  expect(release).toContain('gh release upload "$tag" "$asset#${ASSET_NAME}"');
  expect(release).toContain('Release asset mismatch');
  expect(release).toContain('Require successful declared CI gates');
  expect(release).toContain('missing, blocked, or unsuccessful');
  expect(release).toContain('Artifact release version regression');
  expect(release).not.toContain('npm publish');
  expect(release).not.toContain('npm view');
  expect(release).not.toContain('npm pack');
  expect(release).not.toContain('package-release');
});

test('does not manage a release workflow without Changesets or an artifact descriptor', async () => {
  const definition = releaseDefinition();
  const directory = await mkdtemp('/tmp/devtools-no-release-');
  directories.push(directory);
  expect(definition.isApplicable?.(directory)).resolves.toBe(false);
});

test('refuses forged traversal paths before emitting a managed workflow', async () => {
  const directory = await createArtifactConsumerAsync({ assetPath: '../plugin.zip' });
  const definition = releaseDefinition();
  expect(definition.render?.(directory)).rejects.toThrow('must remain below the repository root');
});

/*** Render the selected release template through the same managed-file boundary consumers use. */
async function renderArtifactReleaseAsync(): Promise<string> {
  const definition = releaseDefinition();
  const directory = await createArtifactConsumerAsync({ assetPath: 'dist/plugin.zip' });
  const rendered = await definition.render?.(directory);
  if (rendered === undefined) throw new Error('Expected an artifact release renderer.');
  return rendered;
}

/*** Find the single managed release definition instead of depending on workflow array order. */
function releaseDefinition() {
  const definition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (definition === undefined) throw new Error('Missing managed release workflow definition.');
  return definition;
}

/*** Create a standalone private consumer with no npm publication identity or Changesets config. */
async function createArtifactConsumerAsync(input: { readonly assetPath: string }): Promise<string> {
  const directory = await mkdtemp('/tmp/devtools-artifact-consumer-');
  directories.push(directory);
  await mkdir(join(directory, '.ankh'), { recursive: true });
  await writeFile(
    join(directory, '.ankh/release-distribution.json'),
    `${JSON.stringify({
      assetName: 'plugin.zip',
      assetPath: input.assetPath,
      buildCommand: ['python3', 'build.py'],
      kind: 'github-artifact',
      requiredChecks: ['CI'],
      verifyCommand: ['python3', 'verify.py'],
      versionCommand: ['python3', 'version.py'],
    })}\n`,
  );
  await writeFile(
    join(directory, 'package.json'),
    '{"name":"ci-tools","private":true,"version":"0.0.0"}\n',
  );
  await writeFile(join(directory, 'bun.lock'), '');
  return directory;
}
