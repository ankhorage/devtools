import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => await rm(directory, { force: true, recursive: true })),
  );
});

test('recovers a tagged release without discarding a modified lockfile', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');

  assertRecoveryWorkflow(release);

  const directory = await mkdtemp('/tmp/devtools-release-recovery-');
  const outputDirectory = await mkdtemp('/tmp/devtools-release-output-');
  temporaryDirectories.push(directory);
  temporaryDirectories.push(outputDirectory);
  const outputPath = join(outputDirectory, 'github-output');
  const releaseCommit = 'chore(release): version packages [skip ci]';

  await createReleaseFixture(directory, releaseCommit);
  const releaseSha = runGit(directory, ['rev-parse', 'HEAD']).trim();
  runGit(directory, ['tag', 'v1.0.0']);
  await writeFile(join(directory, 'workflow-update'), 'current main\n');
  runGit(directory, ['add', 'workflow-update']);
  runGit(directory, ['commit', '-m', 'chore: update managed workflow']);

  const recoveryScript = extractReleaseScript(release);
  runRecoveryScript(directory, outputPath, recoveryScript);

  expect(runGit(directory, ['rev-parse', 'HEAD']).trim()).toBe(releaseSha);
  expect(runGit(directory, ['status', '--short'])).toBe('');
  expect(await readFile(outputPath, 'utf8')).toContain('versioned=true');
  expect(await readFile(outputPath, 'utf8')).toContain(`release_sha=${releaseSha}`);

  await writeFile(join(directory, 'bun.lock'), 'unexpected mutation\n');
  expectRecoveryFailure(directory, outputPath, recoveryScript);
  expect(await readFile(join(directory, 'bun.lock'), 'utf8')).toBe('unexpected mutation\n');
  expect(runGit(directory, ['status', '--short'])).toContain(' M bun.lock');

  await writeFile(join(directory, 'bun.lock'), 'staged mutation\n');
  runGit(directory, ['add', 'bun.lock']);
  expectRecoveryFailure(directory, outputPath, recoveryScript);
  expect(await readFile(join(directory, 'bun.lock'), 'utf8')).toBe('staged mutation\n');
  expect(runGit(directory, ['status', '--short'])).toContain('M  bun.lock');

  runGit(directory, ['restore', '--staged', 'bun.lock']);
  runGit(directory, ['restore', 'bun.lock']);
  await writeFile(join(directory, 'unexpected-untracked-file'), 'retain me\n');
  expectRecoveryFailure(directory, outputPath, recoveryScript);
  expect(await readFile(join(directory, 'unexpected-untracked-file'), 'utf8')).toBe('retain me\n');
  expect(runGit(directory, ['status', '--short'])).toContain('?? unexpected-untracked-file');
});

test('runs the installed repository binary with Bun without changing the frozen lockfile', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');

  const directory = await mkdtemp('/tmp/devtools-release-repository-runtime-');
  const outputDirectory = await mkdtemp('/tmp/devtools-release-repository-output-');
  temporaryDirectories.push(directory, outputDirectory);
  const lockPath = join(directory, 'bun.lock');
  const invocationPath = join(outputDirectory, 'repository-invocations');

  await mkdir(join(directory, 'node_modules/.bin'), { recursive: true });
  await writeFile(join(directory, 'package.json'), '{"name":"fixture","ankh":{}}\n');
  await writeFile(lockPath, 'frozen lockfile\n');
  await writeFile(
    join(directory, 'node_modules/.bin/ankhorage-repository'),
    `#!/usr/bin/env node
if (typeof Bun === 'undefined') throw new Error('Bun is not defined');
require('node:fs').appendFileSync(process.env.REPOSITORY_INVOCATIONS, \`\${process.argv.slice(2).join(' ')}|\${Bun.version}\\n\`);
`,
  );

  runRepositoryMaterializationScript(
    directory,
    invocationPath,
    extractRepositoryMaterializationScript(release),
  );

  expect(await readFile(invocationPath, 'utf8')).toMatch(
    /^package sync \.[|].+\npackage status \.[|].+\n$/u,
  );
  expect(await readFile(lockPath, 'utf8')).toBe('frozen lockfile\n');
  expect(release).toContain('bun install --frozen-lockfile');
});

function assertRecoveryWorkflow(release: string): void {
  const syncIndex = release.indexOf('Synchronize latest main');
  const installIndex = release.indexOf('Install dependencies');
  const buildIndex = release.indexOf('Build package');
  expect(syncIndex).toBeGreaterThanOrEqual(0);
  expect(syncIndex).toBeLessThan(installIndex);
  expect(syncIndex).toBeLessThan(buildIndex);
  expect(release.match(/git checkout -B main origin\/main/gu)).toHaveLength(1);
  expect(release).toContain('bun ./node_modules/.bin/ankhorage-repository package sync .');
  expect(release).toContain('bun ./node_modules/.bin/ankhorage-repository package status .');
  expect(release).not.toContain('bunx --bun --no-install ankhorage-repository');
  expect(release).toContain('Release tag mismatch');
  expect(release).toContain('resuming idempotent finalization');
  expect(release).toContain('git diff --quiet');
  expect(release).toContain('git diff --cached --quiet');
  expect(release).toContain('git ls-files --others --exclude-standard');
  expect(release).toContain('Release recovery requires a clean worktree');
  expect(release).toContain(
    'Refusing to discard changes while switching to canonical release commit',
  );
  expect(release.indexOf('Release recovery requires a clean worktree')).toBeLessThan(
    release.indexOf('git checkout --detach "$release_sha"'),
  );
  expect(release).toContain('git checkout --detach "$release_sha"');
  expect(release).toContain('echo "package_version=$current_version" >> "$GITHUB_OUTPUT"');
  expect(release).toContain('echo "release_sha=$release_sha" >> "$GITHUB_OUTPUT"');
}

async function createReleaseFixture(directory: string, releaseCommit: string): Promise<void> {
  await mkdir(join(directory, '.changeset'), { recursive: true });
  await writeFile(join(directory, '.changeset', 'config.json'), '{}\n');
  await writeFile(join(directory, '.changeset', 'README.md'), '# Changesets\n');
  await writeFile(join(directory, 'package.json'), '{"name":"fixture","version":"1.0.0"}\n');
  await writeFile(join(directory, 'bun.lock'), 'baseline\n');
  runGit(directory, ['init', '--initial-branch=main']);
  runGit(directory, ['config', 'user.name', 'fixture']);
  runGit(directory, ['config', 'user.email', 'fixture@example.test']);
  runGit(directory, ['add', '.']);
  runGit(directory, ['commit', '-m', releaseCommit]);
}

function extractReleaseScript(release: string): string {
  const versionStep = release.indexOf('      - name: Version packages directly on main');
  const scriptMarker = '        run: |\n';
  const scriptStartIndex = release.indexOf(scriptMarker, versionStep);
  const scriptStart = scriptStartIndex + scriptMarker.length;
  const scriptEnd = release.indexOf(
    '\n      - name: Verify standalone packed install',
    scriptStart,
  );

  if (versionStep === -1 || scriptStartIndex === -1 || scriptEnd === -1) {
    throw new Error('Expected the rendered release workflow versioning step.');
  }

  return release
    .slice(scriptStart, scriptEnd)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

function extractRepositoryMaterializationScript(release: string): string {
  const stepStart = release.indexOf('      - name: Synchronize package capability metadata');
  const scriptMarker = '        run: |\n';
  const scriptStartIndex = release.indexOf(scriptMarker, stepStart);
  const scriptStart = scriptStartIndex + scriptMarker.length;
  const scriptEnd = release.indexOf('\n      - name: Verify npm release baseline', scriptStart);

  if (stepStart === -1 || scriptStartIndex === -1 || scriptEnd === -1) {
    throw new Error('Expected the rendered release workflow package materialization step.');
  }

  return release
    .slice(scriptStart, scriptEnd)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

function runGit(directory: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
}

function runRecoveryScript(directory: string, outputPath: string, script: string): void {
  execFileSync('bash', ['-e', '-c', script], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: outputPath },
  });
}

function runRepositoryMaterializationScript(
  directory: string,
  invocationPath: string,
  script: string,
): void {
  execFileSync('bash', ['-e', '-c', script], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, REPOSITORY_INVOCATIONS: invocationPath },
  });
}

function expectRecoveryFailure(directory: string, outputPath: string, script: string): void {
  try {
    runRecoveryScript(directory, outputPath, script);
  } catch (error) {
    if (!(error instanceof Error)) throw error;

    const commandError = error as Error & { stdout?: string; stderr?: string };
    expect(`${commandError.stdout ?? ''}${commandError.stderr ?? ''}`).toContain(
      'Release recovery requires a clean worktree',
    );
    return;
  }

  throw new Error('Expected recovery to reject a dirty worktree.');
}
