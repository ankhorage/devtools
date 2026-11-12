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

  expect(release).toContain("readFileSync('.ankh/release-distribution.json', 'utf8')");
  expect(release).toContain('spawnSync(argv[0], argv.slice(1)');
  expect(release).not.toContain('python3');
  expect(release).toContain('permission-checks: read');
  expect(release).toContain('checks: read');
  expect(release).toContain('permission-contents: read');
  expect(release.slice(release.indexOf('  finalize:'))).toContain('permission-contents: write');
  expect(release).toContain('Existing release asset bytes differ');
  expect(release).toContain('portable content');
  expect(release).toContain('Require successful declared CI gates');
  expect(release).toContain('failed, cancelled, skipped, or were blocked');
  expect(release).toContain('Artifact release version regression');
  expect(release).not.toContain('npm publish');
  expect(release).not.toContain('npm view');
  expect(release).not.toContain('npm pack');
  expect(release).not.toContain('package-release');
  expect(release).toContain('for attempt in $(seq 1 18)');
  expect(release).toContain('Checkout canonical release commit for recovery');
  expect(release).toContain('workflow_dispatch:');
  expect(release).toContain('release_tag:');
  expect(release).toContain('refs/tags/${tag}^{commit}');
  expect(release).toContain('Incomplete GitHub Check Runs response; refusing to publish.');
  expect(release).toContain('gh release create "$tag" --repo "$GITHUB_REPOSITORY" --draft');
  expect(release).toContain('cmp "release-artifact/${companion}" "remote-artifact/${companion}"');
  expect(release).toContain('rm -rf remote-artifact');
  expect(release).toContain('gh release edit "$tag" --repo "$GITHUB_REPOSITORY" --draft=false');
  expect(release).toContain('release_draft');
  expect(release).toContain('releases/tags/${tag}" --jq .id');
  expect(release).toContain('releases/${release_id}/assets?per_page=100');
  expect(release).toContain('Duplicate release asset name');
  expect(release).not.toContain('releases/tags/${tag}/assets');
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

test('does not render descriptor command or expression data into YAML', async () => {
  const directory = await createArtifactConsumerAsync({ assetPath: 'dist/plugin.zip' });
  const descriptorPath = join(directory, '.ankh/release-distribution.json');
  const descriptor = JSON.parse(await Bun.file(descriptorPath).text()) as Record<string, unknown>;
  descriptor.buildCommand = ['node', '-e', "process.stdout.write('${{ secrets.TOP_SECRET }}')"];
  await Bun.write(descriptorPath, `${JSON.stringify(descriptor)}\n`);
  const rendered = await releaseDefinition().render?.(directory);
  expect(rendered).not.toContain('TOP_SECRET');
});

test('treats apostrophes, expressions, and substitutions as runtime argv data', async () => {
  const directory = await createArtifactConsumerAsync({
    assetPath: 'dist/$(printf safe)-${{ github.sha }}.zip',
  });
  const descriptorPath = join(directory, '.ankh/release-distribution.json');
  const descriptor = JSON.parse(await Bun.file(descriptorPath).text()) as Record<string, unknown>;
  descriptor.buildCommand = ['node', '-e', 'process.stdout.write("apostrophe: \'")'];
  await Bun.write(descriptorPath, `${JSON.stringify(descriptor)}\n`);
  const rendered = await releaseDefinition().render?.(directory);
  expect(rendered).not.toContain('printf safe');
  expect(rendered).not.toContain('github.sha');
  expect(rendered).not.toContain('apostrophe:');
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
      requiredChecks: ['validate'],
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
