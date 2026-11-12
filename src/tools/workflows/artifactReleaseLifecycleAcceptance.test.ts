import { execFileSync } from 'node:child_process';
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map(async (directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('executes the generated artifact lifecycle against an isolated GitHub CLI fixture', async () => {
  const workflow = await renderArtifactWorkflowAsync();
  const scripts = extractScripts(workflow);
  const fixture = await createFixtureAsync();

  run(fixture.directory, scripts.select, { GITHUB_OUTPUT: fixture.output, RECOVERY_TAG: 'v1.2.0' });
  const output = await readFile(fixture.output, 'utf8');
  expect(output).toContain(`release_sha=${fixture.releaseSha}`);
  expect(output).toContain('package_version=1.2.0');
  run(fixture.directory, scripts.build, {
    ASSET_NAME: 'plugin.zip',
    RELEASE_SHA: fixture.releaseSha,
    RELEASE_VERSION: '1.2.0',
    RUNNER_TEMP: fixture.runnerTemp,
  });
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
  const checksum = await readFile(join(fixture.remoteAssets, 'plugin.zip.sha256'), 'utf8');
  expect(checksum).toBe(
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
  'cancelled',
  'skipped',
  'timed-out',
  'neutral',
  'missing',
  'wrong-release-commit',
  'stale-success',
  'ambiguous',
  'incomplete-pagination',
  'api-403',
  'api-500',
  'invalid-response',
] as const)('executes declared CI gate case %s without publishing on failure', async (mode) => {
  const scripts = extractScripts(await renderArtifactWorkflowAsync());
  const fixture = await createFixtureAsync({ initialRelease: false, tagged: false });
  const environment = fixture.gateEnvironment({ mode });
  const expectedSuccess = mode === 'success' || mode === 'pending-success';

  if (expectedSuccess) {
    run(fixture.directory, scripts.gates, environment);
    expect((await gateAttemptsAsync(fixture)) >= (mode === 'pending-success' ? 2 : 1)).toBe(true);
    return;
  }

  expect(() => run(fixture.directory, scripts.gates, environment)).toThrow();
  expect(await releaseStateAsync(fixture)).toMatchObject({ exists: false });
  expect(await Bun.file(join(fixture.remoteAssets, 'plugin.zip')).exists()).toBe(false);
});

test('generates and executes the artifact lifecycle from an installed packed Devtools consumer', async () => {
  const consumer = await createPackedArtifactConsumerAsync();
  const workflow = await readFile(join(consumer, '.github/workflows/release.yml'), 'utf8');
  const sourceWorkflow = await renderArtifactWorkflowAsync();
  const scripts = extractScripts(workflow);
  const fixture = await createFixtureAsync({ initialRelease: false, tagged: false });

  expect(workflow).toBe(sourceWorkflow);
  expect(workflow).toContain("kind !== 'github-artifact'");
  expect(workflow).not.toContain('npm publish');
  expect(
    await Bun.file(
      join(consumer, 'node_modules/@ankhorage/devtools/dist/cli/bin/repository.js'),
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
    const workflow = await renderArtifactWorkflowAsync();
    const scripts = extractScripts(workflow);
    const fixture = await createFixtureAsync();
    run(fixture.directory, scripts.select, { GITHUB_OUTPUT: fixture.output });
    run(fixture.directory, scripts.build, {
      ASSET_NAME: 'plugin.zip',
      RELEASE_SHA: fixture.releaseSha,
      RELEASE_VERSION: '1.2.0',
      RUNNER_TEMP: fixture.runnerTemp,
    });
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
  await writeFile(join(directory, '.ankh/release-distribution.json'), descriptor());
  const release = await workflowManagedFiles[1].render?.(directory);
  if (release === undefined) throw new Error('Expected artifact release workflow.');
  return release;
}

/*** Create a Git history with an annotated old tag and a later main commit. */
async function createFixtureAsync({
  initialRelease = true,
  tagged = true,
}: {
  readonly initialRelease?: boolean;
  readonly tagged?: boolean;
} = {}) {
  const directory = await mkdtemp('/tmp/devtools-artifact-lifecycle-');
  const runnerTemp = await mkdtemp('/tmp/devtools-artifact-runner-');
  const remoteAssets = await mkdtemp('/tmp/devtools-artifact-assets-');
  const remote = await mkdtemp('/tmp/devtools-artifact-remote-');
  const bin = await mkdtemp('/tmp/devtools-artifact-bin-');
  const output = join(runnerTemp, 'github-output');
  const state = join(runnerTemp, 'release.json');
  directories.push(directory, runnerTemp, remoteAssets, remote, bin);
  await writeConsumerAsync(directory);
  git(directory, ['init', '--initial-branch=main']);
  git(directory, ['config', 'user.name', 'fixture']);
  git(directory, ['config', 'user.email', 'fixture@example.test']);
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'feat: artifact']);
  const releaseSha = git(directory, ['rev-parse', 'HEAD']).trim();
  if (tagged) {
    git(directory, ['tag', '-a', 'v1.2.0', '-m', 'fixture release']);
    await writeFile(join(directory, 'advanced-main'), 'main advanced\n');
    git(directory, ['add', '.']);
    git(directory, ['commit', '-m', 'chore: advance main']);
    git(directory, ['tag', 'v1.3.0']);
  }
  git(remote, ['init', '--bare']);
  git(directory, ['remote', 'add', 'origin', remote]);
  git(directory, ['push', '--tags', 'origin', 'main']);
  await writeFile(
    state,
    JSON.stringify({
      draft: initialRelease,
      events: [],
      exists: initialRelease,
      id: 1,
      target: releaseSha,
    }) + '\n',
  );
  await writeFile(join(bin, 'gh'), fakeGitHubCli());
  await writeFile(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  await chmod(join(bin, 'gh'), 0o755);
  await chmod(join(bin, 'sleep'), 0o755);
  return {
    bin,
    directory,
    finalizeEnvironment: (extra: { readonly mode?: string } = {}) => ({
      ASSET_NAME: 'plugin.zip',
      GITHUB_REPOSITORY: 'fixture/repository',
      GH_FIXTURE_ASSETS: remoteAssets,
      GH_FIXTURE_MODE: extra.mode ?? '',
      GH_FIXTURE_STATE: state,
      PATH: `${bin}:${process.env.PATH}`,
      RELEASE_SHA: releaseSha,
      RELEASE_VERSION: '1.2.0',
    }),
    gateEnvironment: (extra: { readonly mode?: string } = {}) => ({
      GITHUB_REPOSITORY: 'fixture/repository',
      GH_FIXTURE_GATE_ATTEMPTS: join(runnerTemp, 'gate-attempts'),
      GH_FIXTURE_GATE_MODE: extra.mode ?? 'success',
      GH_FIXTURE_RELEASE_SHA: releaseSha,
      PATH: `${bin}:${process.env.PATH}`,
      RELEASE_SHA:
        extra.mode === 'wrong-release-commit'
          ? '0000000000000000000000000000000000000000'
          : releaseSha,
      RUNNER_TEMP: runnerTemp,
    }),
    output,
    releaseSha,
    remoteAssets,
    runnerTemp,
    state,
  };
}

/*** Install a fresh packed Devtools artifact and generate the consumer workflow through its public CLI. */
async function createPackedArtifactConsumerAsync(): Promise<string> {
  const directory = await mkdtemp('/tmp/devtools-artifact-packed-consumer-');
  const consumer = join(directory, 'consumer');
  directories.push(directory);
  execFileSync('bun', ['run', 'build'], { cwd: process.cwd(), encoding: 'utf8' });
  execFileSync('bun', ['pm', 'pack', '--destination', directory], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const archiveName = (await readdir(directory)).find((name) => name.endsWith('.tgz'));
  if (archiveName === undefined)
    throw new Error('Expected Bun to create a Devtools package tarball.');
  const archive = join(directory, archiveName);
  await mkdir(join(consumer, '.ankh'), { recursive: true });
  await writeFile(join(consumer, '.ankh/release-distribution.json'), descriptor());
  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'packed-artifact-consumer', private: true, version: '0.0.0' })}\n`,
  );
  execFileSync('npm', ['install', '--ignore-scripts', '--no-save', archive], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: join(directory, 'npm-cache') },
  });
  execFileSync(
    'node',
    [
      join(consumer, 'node_modules/@ankhorage/devtools/dist/cli/bin/repository.js'),
      'workflows',
      'sync',
      '.',
    ],
    { cwd: consumer, encoding: 'utf8' },
  );
  return consumer;
}

/*** Supply the exact build environment that Actions provides to the generated production block. */
function buildEnvironment(fixture: {
  readonly releaseSha: string;
  readonly runnerTemp: string;
}): Record<string, string> {
  return {
    ASSET_NAME: 'plugin.zip',
    RELEASE_SHA: fixture.releaseSha,
    RELEASE_VERSION: '1.2.0',
    RUNNER_TEMP: fixture.runnerTemp,
  };
}

/*** Write a minimal checked-in consumer whose commands create and verify a real ZIP payload. */
async function writeConsumerAsync(directory: string): Promise<void> {
  await mkdir(join(directory, '.ankh'), { recursive: true });
  await mkdir(join(directory, 'scripts'), { recursive: true });
  await mkdir(join(directory, 'dist'), { recursive: true });
  await writeFile(join(directory, '.ankh/release-distribution.json'), descriptor());
  await writeFile(join(directory, 'scripts/version.cjs'), "console.log('1.2.0');\n");
  await writeFile(join(directory, 'dist', '.gitkeep'), '');
  await writeFile(join(directory, 'payload.txt'), 'artifact payload\n');
}

/*** Keep the consumer descriptor executable with argv rather than shell interpolation. */
function descriptor(): string {
  return `${JSON.stringify({
    assetName: 'plugin.zip',
    assetPath: 'dist/plugin.zip',
    buildCommand: ['zip', '-j', 'dist/plugin.zip', 'payload.txt'],
    kind: 'github-artifact',
    requiredChecks: ['validate'],
    verifyCommand: ['unzip', '-t', 'dist/plugin.zip'],
    versionCommand: ['node', 'scripts/version.cjs'],
  })}\n`;
}

/*** Extract the literal production shell bodies from the generated Actions workflow. */
function extractScripts(workflow: string): {
  readonly build: string;
  readonly finalize: string;
  readonly gates: string;
  readonly select: string;
} {
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

/*** Extract one Actions run block without reimplementing any production release behavior. */
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
async function releaseStateAsync(fixture: { readonly state: string }): Promise<{
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
async function gateAttemptsAsync(fixture: { readonly runnerTemp: string }): Promise<number> {
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
async function stageFinalizationAssetsAsync(fixture: {
  readonly directory: string;
  readonly runnerTemp: string;
}): Promise<void> {
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

/*** Simulate only the GitHub CLI boundary while retaining its stateful release lifecycle. */
function fakeGitHubCli(): string {
  return `#!/usr/bin/env node
const { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { basename, join } = require('node:path');
const args = process.argv.slice(2); const statePath = process.env.GH_FIXTURE_STATE; const assets = process.env.GH_FIXTURE_ASSETS;
const state = () => JSON.parse(readFileSync(statePath, 'utf8')); const save = (value) => writeFileSync(statePath, JSON.stringify(value) + '\\n'); const record = (value, event) => save({ ...value, events: [...value.events, event] });
const mode = process.env.GH_FIXTURE_MODE;
const endpoint = args.find((arg) => arg.includes('/')) ?? '';
if (args[0] === 'api' && endpoint.includes('/check-runs')) { const gateMode = process.env.GH_FIXTURE_GATE_MODE; const attemptsPath = process.env.GH_FIXTURE_GATE_ATTEMPTS; const attempts = existsSync(attemptsPath) ? Number(readFileSync(attemptsPath, 'utf8')) + 1 : 1; writeFileSync(attemptsPath, String(attempts)); if (gateMode === 'api-403' || gateMode === 'api-500') { process.stderr.write('HTTP ' + gateMode.slice(4) + '\\n'); process.exit(1); } if (gateMode === 'invalid-response') { process.stdout.write('{'); process.exit(0); } const wrongSha = !endpoint.includes(process.env.GH_FIXTURE_RELEASE_SHA); const run = (status, conclusion = null, head_sha = process.env.GH_FIXTURE_RELEASE_SHA) => ({ name: 'validate', status, conclusion, head_sha }); const response = gateMode === 'incomplete-pagination' ? { total_count: 2, check_runs: [run('completed', 'success')] } : gateMode === 'ambiguous' ? { total_count: 2, check_runs: [run('completed', 'success'), run('completed', 'success')] } : gateMode === 'missing' || gateMode === 'wrong-release-commit' || wrongSha ? { total_count: 0, check_runs: [] } : gateMode === 'pending' || (gateMode === 'pending-success' && attempts === 1) ? { total_count: 1, check_runs: [run('in_progress')] } : gateMode === 'failed' ? { total_count: 1, check_runs: [run('completed', 'failure')] } : gateMode === 'cancelled' ? { total_count: 1, check_runs: [run('completed', 'cancelled')] } : gateMode === 'skipped' ? { total_count: 1, check_runs: [run('completed', 'skipped')] } : gateMode === 'timed-out' ? { total_count: 1, check_runs: [run('completed', 'timed_out')] } : gateMode === 'neutral' ? { total_count: 1, check_runs: [run('completed', 'neutral')] } : gateMode === 'stale-success' ? { total_count: 1, check_runs: [run('completed', 'success', '1111111111111111111111111111111111111111')] } : { total_count: 1, check_runs: [run('completed', 'success')] }; process.stdout.write(JSON.stringify(response)); process.exit(0); }
if (args[0] === 'api') { const value = state(); if (mode === '403' || mode === '500') { process.stderr.write('HTTP ' + mode + '\\n'); process.exit(1); } if (mode === '404' || (endpoint.includes('/releases/tags/') && !value.exists)) { process.stderr.write('HTTP 404\\n'); process.exit(1); } if (args.includes('--paginate')) { const names = readdirSync(assets).map((name) => ({ name })); if (mode === 'duplicate') names.push({ name: 'plugin.zip' }); process.stdout.write(JSON.stringify([names])); } else if (args.includes('--jq')) process.stdout.write(String(value.id) + '\\n'); else process.stdout.write(String(value.id) + '\\n'); process.exit(0); }
if (args[0] !== 'release') process.exit(1); const command = args[1]; const value = state();
if (command === 'view') { if (!value.exists) process.exit(1); if (args.includes('--json')) process.stdout.write(args.includes('targetCommitish') ? value.target + '\\n' : String(value.draft) + '\\n'); process.exit(0); }
if (command === 'create') { const target = args[args.indexOf('--target') + 1]; record({ ...value, draft: true, exists: true, target }, 'create-draft'); process.exit(0); }
if (command === 'upload') { const source = args[3].split('#')[0]; const name = basename(source); mkdirSync(assets, { recursive: true }); copyFileSync(source, join(assets, name)); record(value, 'upload:' + name); process.exit(0); }
if (command === 'download') { const name = args[args.indexOf('--pattern') + 1]; const directory = args[args.indexOf('--dir') + 1]; if (!existsSync(join(assets, name))) process.exit(1); mkdirSync(directory, { recursive: true }); copyFileSync(join(assets, name), join(directory, name)); record(value, 'download:' + name); process.exit(0); }
if (command === 'edit') { record({ ...value, draft: false }, 'publish'); process.exit(0); }
process.exit(1);
`;
}
