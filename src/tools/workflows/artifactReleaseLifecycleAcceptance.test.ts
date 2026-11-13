import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  artifactReleaseDescriptor,
  type ArtifactReleaseLifecycleFixture,
  createArtifactReleaseLifecycleFixtureAsync,
} from './createArtifactReleaseLifecycleFixtureAsync.test.js';
import { createPackedArtifactConsumerAsync } from './createPackedArtifactConsumerAsync.test.js';
import { workflowManagedFiles } from './index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('executes the generated artifact lifecycle against an isolated GitHub CLI fixture', async () => {
  const scripts = extractScripts(await renderArtifactWorkflowAsync());
  const fixture = await createFixtureAsync();

  run(fixture.directory, scripts.select, { GITHUB_OUTPUT: fixture.output, RECOVERY_TAG: 'v1.2.0' });
  expect(await readFile(fixture.output, 'utf8')).toContain(`release_sha=${fixture.releaseSha}`);
  run(fixture.directory, scripts.build, buildEnvironment(fixture));
  await stageFinalizationAssetsAsync(fixture);
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(await releaseStateAsync(fixture)).toMatchObject({ draft: false });
  expect((await readdir(fixture.remoteAssets)).sort()).toEqual([
    'plugin.zip',
    'plugin.zip.provenance.json',
    'plugin.zip.sha256',
  ]);

  await writeFile(
    fixture.state,
    JSON.stringify({ draft: true, events: [], exists: true, id: 1, target: fixture.releaseSha }) +
      '\n',
  );
  await rm(join(fixture.remoteAssets, 'plugin.zip.sha256'));
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(await Bun.file(join(fixture.remoteAssets, 'plugin.zip.sha256')).exists()).toBe(true);
  const beforeResume = await readFile(join(fixture.remoteAssets, 'plugin.zip'), 'utf8');
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(await readFile(join(fixture.remoteAssets, 'plugin.zip'), 'utf8')).toBe(beforeResume);
}, 60_000);

test('executes a first artifact release from no tag or GitHub release through draft verification', async () => {
  const scripts = extractScripts(await renderArtifactWorkflowAsync());
  const fixture = await createFixtureAsync({ initialRelease: false, tagged: false });

  run(fixture.directory, scripts.select, { GITHUB_OUTPUT: fixture.output });
  run(fixture.directory, scripts.build, buildEnvironment(fixture));
  await stageFinalizationAssetsAsync(fixture);
  run(fixture.directory, scripts.gates, fixture.gateEnvironment());
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());

  const state = await releaseStateAsync(fixture);
  expect(state).toMatchObject({ draft: false, target: fixture.releaseSha });
  expect(git(fixture.directory, ['rev-parse', 'v1.2.0^{commit}']).trim()).toBe(fixture.releaseSha);
  expect(await zipPayloadAsync(join(fixture.remoteAssets, 'plugin.zip'))).toBe(
    'artifact payload\n',
  );
  expect(await readFile(join(fixture.remoteAssets, 'plugin.zip.sha256'), 'utf8')).toBe(
    `${await sha256Async(join(fixture.remoteAssets, 'plugin.zip'))}  plugin.zip\n`,
  );
  expect(
    JSON.parse(await readFile(join(fixture.remoteAssets, 'plugin.zip.provenance.json'), 'utf8')),
  ).toEqual({
    asset: 'plugin.zip',
    commit: fixture.releaseSha,
    sha256: await sha256Async(join(fixture.remoteAssets, 'plugin.zip')),
    version: '1.2.0',
  });
  expect(state.events).toEqual([
    'create-draft',
    'upload:plugin.zip',
    'upload:plugin.zip.sha256',
    'upload:plugin.zip.provenance.json',
    'download:plugin.zip',
    'download:plugin.zip.sha256',
    'download:plugin.zip.provenance.json',
    'publish',
  ]);

  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(
    (await releaseStateAsync(fixture)).events.filter((event) => !event.startsWith('download:')),
  ).toEqual(state.events.filter((event) => !event.startsWith('download:')));
}, 60_000);

test.each([
  'success',
  'pending-success',
  'pending',
  'failed',
  'billing-blocked',
  'cancelled',
  'skipped',
  'timed-out',
  'neutral',
  'missing',
  'wrong-release-commit',
  'stale-success',
  'ambiguous',
  'incomplete-pagination',
  'incomplete-workflow-pagination',
  'api-403',
  'api-404',
  'api-500',
  'invalid-response',
  'invalid-workflow-response',
  'foreign-workflow',
  'missing-workflow-provenance',
  'pr-ci-success',
  'pr-ci-billing-blocked',
] as const)('executes declared CI gate case %s without publishing on failure', async (mode) => {
  const scripts = extractScripts(await renderArtifactWorkflowAsync());
  const fixture = await createFixtureAsync({ initialRelease: false, tagged: false });
  const expectedSuccess = mode === 'success' || mode === 'pending-success';

  if (expectedSuccess) {
    run(fixture.directory, scripts.gates, fixture.gateEnvironment({ mode }));
    expect((await gateAttemptsAsync(fixture)) >= (mode === 'pending-success' ? 2 : 1)).toBe(true);
    return;
  }

  expect(() => run(fixture.directory, scripts.gates, fixture.gateEnvironment({ mode }))).toThrow();
  expect(await releaseStateAsync(fixture)).toMatchObject({ exists: false });
  expect(await Bun.file(join(fixture.remoteAssets, 'plugin.zip')).exists()).toBe(false);
});

test('generates and executes the artifact lifecycle from an installed packed Devtools consumer', async () => {
  const packed = await createPackedArtifactConsumerAsync();
  directories.push(packed.directory);
  const workflow = await readFile(join(packed.consumer, '.github/workflows/release.yml'), 'utf8');
  const fixture = await createFixtureAsync({ initialRelease: false, tagged: false });
  const scripts = extractScripts(workflow);

  expect(workflow).toBe(await renderArtifactWorkflowAsync());
  expect(workflow).toContain("kind !== 'github-artifact'");
  expect(workflow).not.toContain('npm publish');
  expect(
    await Bun.file(
      join(packed.consumer, 'node_modules/@ankhorage/devtools/dist/cli/bin/repository.js'),
    ).exists(),
  ).toBe(true);
  run(fixture.directory, scripts.select, { GITHUB_OUTPUT: fixture.output });
  run(fixture.directory, scripts.build, buildEnvironment(fixture));
  await stageFinalizationAssetsAsync(fixture);
  run(fixture.directory, scripts.gates, fixture.gateEnvironment());
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(await releaseStateAsync(fixture)).toMatchObject({ draft: false, exists: true });
  expect(await Bun.file(join(fixture.remoteAssets, 'plugin.zip.provenance.json')).exists()).toBe(
    true,
  );
}, 120_000);

test.each(['404', '403', '500', 'duplicate'] as const)(
  'fails closed when the release assets API is %s',
  async (mode) => {
    const scripts = extractScripts(await renderArtifactWorkflowAsync());
    const fixture = await createFixtureAsync();
    run(fixture.directory, scripts.select, { GITHUB_OUTPUT: fixture.output });
    run(fixture.directory, scripts.build, buildEnvironment(fixture));
    await stageFinalizationAssetsAsync(fixture);

    expect(() =>
      run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment({ mode })),
    ).toThrow();
    expect((await releaseStateAsync(fixture)).draft).toBe(true);
  },
);

/*** Render the same managed workflow boundary used by a consumer repository. */
async function renderArtifactWorkflowAsync(): Promise<string> {
  const directory = await mkdtemp('/tmp/devtools-artifact-workflow-render-');
  directories.push(directory);
  await mkdir(join(directory, '.ankh'), { recursive: true });
  await writeFile(join(directory, '.ankh/release-distribution.json'), artifactReleaseDescriptor());
  const release = workflowManagedFiles[1].render?.(directory);
  if (release === undefined) throw new Error('Expected artifact release workflow.');
  return release;
}

/*** Create and register an independently cleaned lifecycle fixture. */
async function createFixtureAsync(
  options: { readonly initialRelease?: boolean; readonly tagged?: boolean } = {},
): Promise<ArtifactReleaseLifecycleFixture> {
  const fixture = await createArtifactReleaseLifecycleFixtureAsync(options);
  directories.push(...fixture.directories);
  return fixture;
}

/*** Supply the exact build environment that Actions provides to the generated production block. */
function buildEnvironment(fixture: ArtifactReleaseLifecycleFixture): Record<string, string> {
  return {
    ASSET_NAME: 'plugin.zip',
    RELEASE_SHA: fixture.releaseSha,
    RELEASE_VERSION: '1.2.0',
    RUNNER_TEMP: fixture.runnerTemp,
  };
}

/*** Extract the literal production shell bodies from the generated Actions workflow. */
function extractScripts(
  workflow: string,
): Record<'build' | 'finalize' | 'gates' | 'select', string> {
  return {
    build: extractScript(
      workflow,
      'Build and verify exact artifact',
      'Require successful declared CI gates',
    ),
    finalize: extractScript(workflow, 'Finalize immutable artifact release', undefined),
    gates: extractScript(
      workflow,
      'Require successful declared CI gates',
      'Retain exact artifact for finalization',
    ),
    select: extractScript(
      workflow,
      'Select explicit artifact release intent',
      'Checkout canonical release commit for recovery',
    ),
  };
}

/*** Extract one Actions run block without reimplementing production release behavior. */
function extractScript(workflow: string, name: string, nextName: string | undefined): string {
  const step = workflow.indexOf(`      - name: ${name}`);
  const marker = '        run: |\n';
  const start = workflow.indexOf(marker, step);
  const end =
    nextName === undefined
      ? workflow.length
      : workflow.indexOf(`\n      - name: ${nextName}`, start);
  if (step === -1 || start === -1 || end === -1) throw new Error(`Missing workflow step: ${name}`);
  return workflow
    .slice(start + marker.length, end)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

/*** Run the generated shell with an isolated filesystem and GitHub CLI fixture. */
function run(directory: string, script: string, environment: Record<string, string>): void {
  execFileSync('bash', ['-e', '-c', script], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, ...environment },
  });
}

/*** Read the fixture's release state to prove failed finalization remains a draft. */
async function releaseStateAsync(fixture: ArtifactReleaseLifecycleFixture): Promise<{
  readonly draft: boolean;
  readonly events: readonly string[];
  readonly exists: boolean;
  readonly target: string;
}> {
  return JSON.parse(await readFile(fixture.state, 'utf8')) as {
    readonly draft: boolean;
    readonly events: readonly string[];
    readonly exists: boolean;
    readonly target: string;
  };
}

/*** Read the stateful CLI counter to prove pending checks were polled rather than accepted. */
async function gateAttemptsAsync(fixture: ArtifactReleaseLifecycleFixture): Promise<number> {
  return Number.parseInt(await readFile(join(fixture.runnerTemp, 'gate-attempts'), 'utf8'), 10);
}

/*** Hash the remote ZIP bytes independently of the generated release workflow. */
async function sha256Async(path: string): Promise<string> {
  return (await Bun.$`shasum -a 256 ${path}`.text()).split(' ')[0] ?? '';
}

/*** Read the ZIP payload to prove the generated build created the expected archive contents. */
async function zipPayloadAsync(path: string): Promise<string> {
  return await Bun.$`unzip -p ${path} payload.txt`.text();
}

/*** Stage the exact generated artifact as Actions download-artifact provides it to finalization. */
async function stageFinalizationAssetsAsync(
  fixture: ArtifactReleaseLifecycleFixture,
): Promise<void> {
  const destination = join(fixture.directory, 'release-artifact');
  await mkdir(destination, { recursive: true });
  await Promise.all(
    ['plugin.zip', 'plugin.zip.sha256', 'plugin.zip.provenance.json'].map(
      async (name) => await copyFile(join(fixture.runnerTemp, name), join(destination, name)),
    ),
  );
}

/*** Run real Git commands so annotated-tag resolution and main advancement are exercised. */
function git(directory: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
}
