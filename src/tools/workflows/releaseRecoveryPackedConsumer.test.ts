import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { createPackedDevtoolsConsumerAsync } from './createPackedDevtoolsConsumerAsync.test.js';
import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('executes recovery selection with a frozen packed Devtools consumer', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Expected the managed release workflow renderer.');
  const scripts = extractReleaseScripts(release);

  for (const tag of ['correct', 'missing'] as const) {
    const fixture = await createFixtureAsync(tag);
    const lockfile = await readFile(join(fixture.directory, 'bun.lock'), 'utf8');
    runDetection(fixture.directory, fixture.outputPath, scripts.detection, '1.0.0');
    expect(await readFile(fixture.outputPath, 'utf8')).toContain('recovery=true');
    await runSelectedPathAsync(fixture.directory, fixture.outputPath, scripts);
    expect(await readFile(join(fixture.directory, 'bun.lock'), 'utf8')).toBe(lockfile);
    expect(runGit(fixture.directory, ['rev-parse', 'HEAD']).trim()).toBe(fixture.releaseSha);
    expect(runGit(fixture.directory, ['status', '--short'])).toBe('');
  }

  const mismatchedTag = await createFixtureAsync('wrong');
  expectDetectionFailure(mismatchedTag.directory, mismatchedTag.outputPath, scripts.detection);

  const dirty = await createFixtureAsync('correct');
  const dirtyLockfile = 'dirty lockfile retained\n';
  await writeFile(join(dirty.directory, 'bun.lock'), dirtyLockfile);
  runDetection(dirty.directory, dirty.outputPath, scripts.detection, '1.0.0');
  expectRecoveryFailure(dirty.directory, dirty.outputPath, scripts.recovery);
  expect(await readFile(join(dirty.directory, 'bun.lock'), 'utf8')).toBe(dirtyLockfile);
  expect(runGit(dirty.directory, ['status', '--short'])).toContain(' M bun.lock');

  const newRelease = await createFixtureAsync('missing');
  const initialLockfile = await readFile(join(newRelease.directory, 'bun.lock'), 'utf8');
  runDetection(newRelease.directory, newRelease.outputPath, scripts.detection, '0.9.0');
  expect(await readFile(newRelease.outputPath, 'utf8')).toContain('recovery=false');
  await runSelectedPathAsync(newRelease.directory, newRelease.outputPath, scripts);
  expect(await readFile(join(newRelease.directory, 'bun.lock'), 'utf8')).not.toBe(initialLockfile);
  expect(release).toContain('bun install --frozen-lockfile');
}, 60_000);

/*** Create and register a packed Devtools consumer fixture for cleanup. */
async function createFixtureAsync(tag: 'correct' | 'missing' | 'wrong') {
  const fixture = await createPackedDevtoolsConsumerAsync(tag);
  temporaryDirectories.push(...fixture.directories);
  return fixture;
}

/*** Extract the shell bodies used to detect, skip, or execute release synchronization. */
function extractReleaseScripts(release: string): {
  readonly detection: string;
  readonly recovery: string;
  readonly synchronization: string;
} {
  return {
    detection: extractScript(
      release,
      'Detect published release recovery',
      'Synchronize package capability metadata',
    ),
    recovery: extractScript(
      release,
      'Version packages directly on main',
      'Verify standalone packed install',
    ),
    synchronization: extractScript(
      release,
      'Synchronize package capability metadata',
      'Validate release contract',
    ),
  };
}

/*** Extract one rendered Actions shell block between named workflow steps. */
function extractScript(release: string, startName: string, endName: string): string {
  const stepStart = release.indexOf(`      - name: ${startName}`);
  const scriptMarker = '        run: |\n';
  const scriptStartIndex = release.indexOf(scriptMarker, stepStart);
  const scriptStart = scriptStartIndex + scriptMarker.length;
  const scriptEnd = release.indexOf(`\n      - name: ${endName}`, scriptStart);
  if (stepStart === -1 || scriptStartIndex === -1 || scriptEnd === -1) {
    throw new Error(`Expected rendered release workflow step ${startName}.`);
  }
  return release
    .slice(scriptStart, scriptEnd)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

/*** Execute published-recovery detection with deterministic npm baseline evidence. */
function runDetection(
  directory: string,
  outputPath: string,
  script: string,
  highestVersion = '1.0.0',
): void {
  execFileSync('bash', ['-e', '-c', script], {
    cwd: directory,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_OUTPUT: outputPath, HIGHEST_PUBLISHED_VERSION: highestVersion },
  });
}

/*** Select the same synchronization boundary as the rendered GitHub Actions condition. */
async function runSelectedPathAsync(
  directory: string,
  outputPath: string,
  scripts: ReturnType<typeof extractReleaseScripts>,
): Promise<void> {
  if ((await readFile(outputPath, 'utf8')).includes('recovery=true')) {
    execFileSync('bash', ['-e', '-c', scripts.recovery], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
    });
    return;
  }
  execFileSync('bash', ['-e', '-c', scripts.synchronization], {
    cwd: directory,
    encoding: 'utf8',
    env: process.env,
  });
}

/*** Prove a wrong finalized tag fails before the mutating synchronization step. */
function expectDetectionFailure(directory: string, outputPath: string, script: string): void {
  try {
    runDetection(directory, outputPath, script);
  } catch (error) {
    if (error instanceof Error) {
      const commandError = error as Error & { stdout?: string; stderr?: string };
      expect(`${commandError.stdout ?? ''}${commandError.stderr ?? ''}`).toContain(
        'Release tag mismatch',
      );
      return;
    }
    throw error;
  }
  throw new Error('Expected published recovery detection to reject a mismatched tag.');
}

/*** Prove strict release recovery retains user changes instead of checking out the release commit. */
function expectRecoveryFailure(directory: string, outputPath: string, script: string): void {
  try {
    execFileSync('bash', ['-e', '-c', script], {
      cwd: directory,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
    });
  } catch (error) {
    if (error instanceof Error) {
      const commandError = error as Error & { stdout?: string; stderr?: string };
      expect(`${commandError.stdout ?? ''}${commandError.stderr ?? ''}`).toContain(
        'Release recovery requires a clean worktree',
      );
      return;
    }
    throw error;
  }
  throw new Error('Expected recovery to reject a dirty worktree.');
}

/*** Run Git assertions against the fixture's canonical release history. */
function runGit(directory: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
}
