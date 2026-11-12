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
    JSON.stringify({ draft: true, target: fixture.releaseSha }) + '\n',
  );
  await rm(join(fixture.remoteAssets, 'plugin.zip.sha256'));
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(await Bun.file(join(fixture.remoteAssets, 'plugin.zip.sha256')).exists()).toBe(true);

  const beforeResume = await readFile(join(fixture.remoteAssets, 'plugin.zip'), 'utf8');
  run(fixture.directory, scripts.finalize, fixture.finalizeEnvironment());
  expect(await readFile(join(fixture.remoteAssets, 'plugin.zip'), 'utf8')).toBe(beforeResume);
}, 60_000);

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
async function createFixtureAsync() {
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
  git(directory, ['tag', '-a', 'v1.2.0', '-m', 'fixture release']);
  await writeFile(join(directory, 'advanced-main'), 'main advanced\n');
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'chore: advance main']);
  git(directory, ['tag', 'v1.3.0']);
  git(remote, ['init', '--bare']);
  git(directory, ['remote', 'add', 'origin', remote]);
  git(directory, ['push', '--tags', 'origin', 'main']);
  await writeFile(state, JSON.stringify({ draft: true, target: releaseSha }) + '\n');
  await writeFile(join(bin, 'gh'), fakeGitHubCli());
  await chmod(join(bin, 'gh'), 0o755);
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
    output,
    releaseSha,
    remoteAssets,
    runnerTemp,
    state,
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
  readonly select: string;
} {
  return {
    build: extractScript(
      workflow,
      'Build and verify exact artifact',
      'Require successful declared CI gates',
    ),
    finalize: extractScript(workflow, 'Finalize immutable artifact release', undefined),
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
async function releaseStateAsync(fixture: {
  readonly state: string;
}): Promise<{ readonly draft: boolean }> {
  return JSON.parse(await readFile(fixture.state, 'utf8')) as { readonly draft: boolean };
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
const state = () => JSON.parse(readFileSync(statePath, 'utf8')); const save = (value) => writeFileSync(statePath, JSON.stringify(value) + '\\n');
const mode = process.env.GH_FIXTURE_MODE;
if (args[0] === 'api') { if (mode === '404' || mode === '403' || mode === '500') process.exit(1); if (args.includes('--paginate')) { const names = readdirSync(assets).map((name) => ({ name })); if (mode === 'duplicate') names.push({ name: 'plugin.zip' }); process.stdout.write(JSON.stringify([names])); } else process.stdout.write('1\\n'); process.exit(0); }
if (args[0] !== 'release') process.exit(1); const command = args[1]; const value = state();
if (command === 'view') { if (args.includes('--json')) process.stdout.write(args.includes('targetCommitish') ? value.target + '\\n' : String(value.draft) + '\\n'); process.exit(0); }
if (command === 'create') { const target = args[args.indexOf('--target') + 1]; save({ draft: true, target }); process.exit(0); }
if (command === 'upload') { const source = args[3].split('#')[0]; mkdirSync(assets, { recursive: true }); copyFileSync(source, join(assets, basename(source))); process.exit(0); }
if (command === 'download') { const name = args[args.indexOf('--pattern') + 1]; const directory = args[args.indexOf('--dir') + 1]; if (!existsSync(join(assets, name))) process.exit(1); mkdirSync(directory, { recursive: true }); copyFileSync(join(assets, name), join(directory, name)); process.exit(0); }
if (command === 'edit') { save({ ...value, draft: false }); process.exit(0); }
process.exit(1);
`;
}
