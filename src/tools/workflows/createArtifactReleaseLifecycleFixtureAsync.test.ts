import { execFileSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type GateMode =
  | 'ambiguous'
  | 'api-403'
  | 'api-500'
  | 'billing-blocked'
  | 'cancelled'
  | 'failed'
  | 'incomplete-pagination'
  | 'invalid-response'
  | 'missing'
  | 'neutral'
  | 'pending'
  | 'pending-success'
  | 'skipped'
  | 'stale-success'
  | 'success'
  | 'timed-out'
  | 'wrong-release-commit';

type ReleaseAssetMode = '403' | '404' | '500' | 'duplicate';

export interface ArtifactReleaseLifecycleFixture {
  readonly bin: string;
  readonly directories: readonly string[];
  readonly directory: string;
  readonly finalizeEnvironment: (extra?: {
    readonly mode?: ReleaseAssetMode;
  }) => Record<string, string>;
  readonly gateEnvironment: (extra?: { readonly mode?: GateMode }) => Record<string, string>;
  readonly output: string;
  readonly releaseSha: string;
  readonly remoteAssets: string;
  readonly runnerTemp: string;
  readonly state: string;
}

/*** Create a GitHub Actions filesystem fixture with a stateful GitHub CLI boundary. */
export async function createArtifactReleaseLifecycleFixtureAsync({
  initialRelease = true,
  tagged = true,
}: {
  readonly initialRelease?: boolean;
  readonly tagged?: boolean;
} = {}): Promise<ArtifactReleaseLifecycleFixture> {
  const paths = await createFixturePathsAsync();
  await writeConsumerAsync(paths.directory);
  const releaseSha = await createGitHistoryAsync(paths.directory, paths.remote, tagged);
  await writeReleaseStateAsync(paths.state, initialRelease, releaseSha);
  await installGitHubFixtureCliAsync(paths.bin);
  return createFixture(paths, releaseSha);
}

/*** Allocate the filesystem boundaries that the isolated lifecycle fixture owns. */
async function createFixturePathsAsync(): Promise<{
  readonly bin: string;
  readonly directory: string;
  readonly remote: string;
  readonly remoteAssets: string;
  readonly runnerTemp: string;
  readonly state: string;
}> {
  const directory = await mkdtemp('/tmp/devtools-artifact-lifecycle-');
  const runnerTemp = await mkdtemp('/tmp/devtools-artifact-runner-');
  return {
    bin: await mkdtemp('/tmp/devtools-artifact-bin-'),
    directory,
    remote: await mkdtemp('/tmp/devtools-artifact-remote-'),
    remoteAssets: await mkdtemp('/tmp/devtools-artifact-assets-'),
    runnerTemp,
    state: join(runnerTemp, 'release.json'),
  };
}

/*** Create the tagged history and origin required by the release workflow. */
async function createGitHistoryAsync(
  directory: string,
  remote: string,
  tagged: boolean,
): Promise<string> {
  git(directory, ['init', '--initial-branch=main']);
  git(directory, ['config', 'user.name', 'fixture']);
  git(directory, ['config', 'user.email', 'fixture@example.test']);
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'feat: artifact']);
  const releaseSha = git(directory, ['rev-parse', 'HEAD']).trim();
  if (tagged) await addAdvancedMainTagsAsync(directory);
  git(remote, ['init', '--bare']);
  git(directory, ['remote', 'add', 'origin', remote]);
  git(directory, ['push', '--tags', 'origin', 'main']);
  return releaseSha;
}

/*** Add the prior annotated release and subsequent main commit used by recovery selection. */
async function addAdvancedMainTagsAsync(directory: string): Promise<void> {
  git(directory, ['tag', '-a', 'v1.2.0', '-m', 'fixture release']);
  await writeFile(join(directory, 'advanced-main'), 'main advanced\n');
  git(directory, ['add', '.']);
  git(directory, ['commit', '-m', 'chore: advance main']);
  git(directory, ['tag', 'v1.3.0']);
}

/*** Persist the simulated remote release state before the generated workflow runs. */
async function writeReleaseStateAsync(
  state: string,
  initialRelease: boolean,
  releaseSha: string,
): Promise<void> {
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
}

/*** Install only the command shims the generated release workflow invokes. */
async function installGitHubFixtureCliAsync(bin: string): Promise<void> {
  await writeFile(join(bin, 'gh'), fakeGitHubCli());
  await writeFile(join(bin, 'sleep'), '#!/usr/bin/env bash\nexit 0\n');
  await chmod(join(bin, 'gh'), 0o755);
  await chmod(join(bin, 'sleep'), 0o755);
}

/*** Bind fixture paths into the environment shape exposed by GitHub Actions. */
function createFixture(
  paths: Awaited<ReturnType<typeof createFixturePathsAsync>>,
  releaseSha: string,
): ArtifactReleaseLifecycleFixture {
  return {
    ...paths,
    directories: [paths.directory, paths.runnerTemp, paths.remoteAssets, paths.remote, paths.bin],
    finalizeEnvironment: (extra = {}) => ({
      ASSET_NAME: 'plugin.zip',
      GITHUB_REPOSITORY: 'fixture/repository',
      GH_FIXTURE_ASSETS: paths.remoteAssets,
      GH_FIXTURE_MODE: extra.mode ?? '',
      GH_FIXTURE_STATE: paths.state,
      PATH: `${paths.bin}:${process.env.PATH}`,
      RELEASE_SHA: releaseSha,
      RELEASE_VERSION: '1.2.0',
    }),
    gateEnvironment: (extra = {}) => ({
      GITHUB_REPOSITORY: 'fixture/repository',
      GH_FIXTURE_GATE_ATTEMPTS: join(paths.runnerTemp, 'gate-attempts'),
      GH_FIXTURE_GATE_MODE: extra.mode ?? 'success',
      GH_FIXTURE_RELEASE_SHA: releaseSha,
      PATH: `${paths.bin}:${process.env.PATH}`,
      RELEASE_SHA:
        extra.mode === 'wrong-release-commit'
          ? '0000000000000000000000000000000000000000'
          : releaseSha,
      RUNNER_TEMP: paths.runnerTemp,
    }),
    output: join(paths.runnerTemp, 'github-output'),
    releaseSha,
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

/*** Return the consumer descriptor used by both generated-workflow execution paths. */
export function artifactReleaseDescriptor(): string {
  return descriptor();
}

/*** Keep the consumer descriptor executable with argv rather than shell interpolation. */
function descriptor(): string {
  return `${JSON.stringify({ assetName: 'plugin.zip', assetPath: 'dist/plugin.zip', buildCommand: ['zip', '-j', 'dist/plugin.zip', 'payload.txt'], kind: 'github-artifact', requiredChecks: ['validate'], verifyCommand: ['unzip', '-t', 'dist/plugin.zip'], versionCommand: ['node', 'scripts/version.cjs'] })}\n`;
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
const mode = process.env.GH_FIXTURE_MODE; const endpoint = args.find((arg) => arg.includes('/')) ?? '';
if (args[0] === 'api' && endpoint.includes('/check-runs')) { const gateMode = process.env.GH_FIXTURE_GATE_MODE; const attemptsPath = process.env.GH_FIXTURE_GATE_ATTEMPTS; const attempts = existsSync(attemptsPath) ? Number(readFileSync(attemptsPath, 'utf8')) + 1 : 1; writeFileSync(attemptsPath, String(attempts)); if (gateMode === 'api-403' || gateMode === 'api-500') { process.stderr.write('HTTP ' + gateMode.slice(4) + '\\n'); process.exit(1); } if (gateMode === 'invalid-response') { process.stdout.write('{'); process.exit(0); } const wrongSha = !endpoint.includes(process.env.GH_FIXTURE_RELEASE_SHA); const run = (status, conclusion = null, head_sha = process.env.GH_FIXTURE_RELEASE_SHA) => ({ name: 'validate', status, conclusion, head_sha }); const response = gateMode === 'incomplete-pagination' ? { total_count: 2, check_runs: [run('completed', 'success')] } : gateMode === 'ambiguous' ? { total_count: 2, check_runs: [run('completed', 'success'), run('completed', 'success')] } : gateMode === 'missing' || gateMode === 'wrong-release-commit' || wrongSha ? { total_count: 0, check_runs: [] } : gateMode === 'pending' || (gateMode === 'pending-success' && attempts === 1) ? { total_count: 1, check_runs: [run('in_progress')] } : gateMode === 'failed' ? { total_count: 1, check_runs: [run('completed', 'failure')] } : gateMode === 'billing-blocked' ? { total_count: 1, check_runs: [run('completed', 'action_required')] } : gateMode === 'cancelled' ? { total_count: 1, check_runs: [run('completed', 'cancelled')] } : gateMode === 'skipped' ? { total_count: 1, check_runs: [run('completed', 'skipped')] } : gateMode === 'timed-out' ? { total_count: 1, check_runs: [run('completed', 'timed_out')] } : gateMode === 'neutral' ? { total_count: 1, check_runs: [run('completed', 'neutral')] } : gateMode === 'stale-success' ? { total_count: 1, check_runs: [run('completed', 'success', '1111111111111111111111111111111111111111')] } : { total_count: 1, check_runs: [run('completed', 'success')] }; process.stdout.write(JSON.stringify(response)); process.exit(0); }
if (args[0] === 'api') { const value = state(); if (mode === '403' || mode === '500') { process.stderr.write('HTTP ' + mode + '\\n'); process.exit(1); } if (mode === '404' || (endpoint.includes('/releases/tags/') && !value.exists)) { process.stderr.write('HTTP 404\\n'); process.exit(1); } if (args.includes('--paginate')) { const names = readdirSync(assets).map((name) => ({ name })); if (mode === 'duplicate') names.push({ name: 'plugin.zip' }); process.stdout.write(JSON.stringify([names])); } else process.stdout.write(String(value.id) + '\\n'); process.exit(0); }
if (args[0] !== 'release') process.exit(1); const command = args[1]; const value = state();
if (command === 'view') { if (!value.exists) process.exit(1); if (args.includes('--json')) process.stdout.write(args.includes('targetCommitish') ? value.target + '\\n' : String(value.draft) + '\\n'); process.exit(0); }
if (command === 'create') { const target = args[args.indexOf('--target') + 1]; record({ ...value, draft: true, exists: true, target }, 'create-draft'); process.exit(0); }
if (command === 'upload') { const source = args[3].split('#')[0]; const name = basename(source); mkdirSync(assets, { recursive: true }); copyFileSync(source, join(assets, name)); record(value, 'upload:' + name); process.exit(0); }
if (command === 'download') { const name = args[args.indexOf('--pattern') + 1]; const directory = args[args.indexOf('--dir') + 1]; if (!existsSync(join(assets, name))) process.exit(1); mkdirSync(directory, { recursive: true }); copyFileSync(join(assets, name), join(directory, name)); record(value, 'download:' + name); process.exit(0); }
if (command === 'edit') { record({ ...value, draft: false }, 'publish'); process.exit(0); }
process.exit(1);
`;
}
