import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, test } from 'bun:test';

import { runChangesetAsync } from './runChangesetAsync.js';

const roots: string[] = [];
const changesetBinary = join(import.meta.dir, 'bin/changeset.ts');

afterAll(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('renamed root package Changesets status', () => {
  test('accepts the current package and rejects missing, malformed, or obsolete release intent', async () => {
    expect(await runStatusAsync("'@ankhorage/infra-k3s': patch")).toBe(0);
    expect(await runStatusAsync('')).toBe(1);
    expect(await runStatusAsync("'@ankhorage/k3s': patch")).toBe(1);
    expect(await runStatusAsync("'@ankhorage/infra-k3s': invalid")).toBe(1);
  });

  test('keeps the base comparison for unchanged, malformed, and unreadable identities', async () => {
    expect(
      await runWithManifests({
        baseManifest: '{"name":"@ankhorage/infra-k3s"}',
        currentManifest: '{"name":"@ankhorage/infra-k3s"}',
      }),
    ).toEqual(['status', '--since=origin/main']);
    expect(
      await runWithManifests({
        baseManifest: '{not json}',
        currentManifest: '{"name":"@ankhorage/infra-k3s"}',
      }),
    ).toEqual(['status', '--since=origin/main']);
    expect(
      await runWithManifests({
        baseManifest: '{"name":"@ankhorage/k3s"}',
        currentManifest: '{"name":"@ankhorage/infra-k3s"}',
        readGitFileError: new Error('unknown revision'),
      }),
    ).toEqual(['status', '--since=origin/main']);
  });
});

/*** Execute the managed Changesets runner in a real renamed-root Git checkout. */
async function runStatusAsync(releaseIntent: string): Promise<number> {
  const root = await createRenamedPackageFixtureAsync(releaseIntent);
  const child = Bun.spawn([process.execPath, changesetBinary, 'status', '--since=origin/main'], {
    cwd: root,
    stderr: 'ignore',
    stdout: 'ignore',
  });
  return await child.exited;
}

/*** Create one minimal repository with a base identity and a renamed current package. */
async function createRenamedPackageFixtureAsync(releaseIntent: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'devtools-renamed-changeset-'));
  roots.push(root);
  await mkdir(join(root, '.changeset'));
  await writeFile(join(root, 'package.json'), '{"name":"@ankhorage/k3s","version":"1.0.0"}\n');
  await writeFile(
    join(root, '.changeset/config.json'),
    '{"changelog":false,"commit":false,"access":"public","baseBranch":"main","updateInternalDependencies":"patch","ignore":[]}\n',
  );
  await runCommandAsync(root, ['init', '--initial-branch=main']);
  await runCommandAsync(root, ['config', 'user.email', 'test@example.invalid']);
  await runCommandAsync(root, ['config', 'user.name', 'test']);
  await runCommandAsync(root, ['add', '.']);
  await runCommandAsync(root, ['commit', '--message', 'base']);
  await runCommandAsync(root, ['branch', 'origin/main']);
  await writeFile(
    join(root, 'package.json'),
    '{"name":"@ankhorage/infra-k3s","version":"1.0.0"}\n',
  );
  await writeFile(join(root, '.changeset/rename.md'), `---\n${releaseIntent}\n---\n\nrename\n`);
  return root;
}

/*** Run one deterministic Git fixture command. */
async function runCommandAsync(cwd: string, command: readonly string[]): Promise<void> {
  const child = Bun.spawn(['git', ...command], { cwd, stderr: 'ignore', stdout: 'ignore' });
  expect(await child.exited).toBe(0);
}

/*** Observe strict argument preservation for non-renamed package identities. */
async function runWithManifests(input: {
  readonly baseManifest: string;
  readonly currentManifest: string;
  readonly readGitFileError?: Error;
}): Promise<readonly string[]> {
  let receivedArgv: readonly string[] = [];
  await runChangesetAsync(['status', '--since=origin/main'], {
    readCurrentPackageManifestAsync: () => Promise.resolve(input.currentManifest),
    readGitFileAsync: () =>
      input.readGitFileError === undefined
        ? Promise.resolve(input.baseManifest)
        : Promise.reject(input.readGitFileError),
    runExternalToolAsync: (argv) => {
      receivedArgv = argv;
      return Promise.resolve({ exitCode: 0 });
    },
  });
  return receivedArgv;
}
