import { describe, expect, test } from 'bun:test';

import { runChangesetAsync } from './runChangesetAsync.js';

describe('runChangesetAsync', () => {
  test('omits the base comparison for a genuine package rename', async () => {
    const argv = await runWithManifests({
      baseManifest: '{"name":"@ankhorage/k3s"}',
      currentManifest: '{"name":"@ankhorage/infra-k3s"}',
    });

    expect(argv).toEqual(['status']);
  });

  test('preserves strict comparison for an unchanged package identity', async () => {
    const argv = await runWithManifests({
      baseManifest: '{"name":"@ankhorage/infra-k3s"}',
      currentManifest: '{"name":"@ankhorage/infra-k3s"}',
    });

    expect(argv).toEqual(['status', '--since=origin/main']);
  });

  test('preserves strict comparison when release intent is missing or unrelated', async () => {
    const missingChangeset = await runWithManifests({
      baseManifest: '{"name":"@ankhorage/infra-k3s"}',
      currentManifest: '{"name":"@ankhorage/infra-k3s"}',
    });
    const unrelatedChangeset = await runWithManifests({
      baseManifest: '{"name":"@ankhorage/infra-k3s"}',
      currentManifest: '{"name":"@ankhorage/infra-k3s"}',
      argv: ['status', '--output=changesets.json', '--since', 'origin/main'],
    });

    expect(missingChangeset).toEqual(['status', '--since=origin/main']);
    expect(unrelatedChangeset).toEqual([
      'status',
      '--output=changesets.json',
      '--since',
      'origin/main',
    ]);
  });

  test('preserves strict comparison for malformed manifests and unavailable Git refs', async () => {
    const malformed = await runWithManifests({
      baseManifest: '{not json}',
      currentManifest: '{"name":"@ankhorage/infra-k3s"}',
    });
    const unavailableReference = await runWithManifests({
      baseManifest: '{"name":"@ankhorage/k3s"}',
      currentManifest: '{"name":"@ankhorage/infra-k3s"}',
      readGitFileError: new Error('unknown revision'),
    });

    expect(malformed).toEqual(['status', '--since=origin/main']);
    expect(unavailableReference).toEqual(['status', '--since=origin/main']);
  });
});

/*** Run the Changesets adapter with deterministic manifest and Git boundaries. */
async function runWithManifests(input: {
  readonly baseManifest: string;
  readonly currentManifest: string;
  readonly argv?: readonly string[];
  readonly readGitFileError?: Error;
}): Promise<readonly string[]> {
  let receivedArgv: readonly string[] = [];

  await runChangesetAsync(input.argv ?? ['status', '--since=origin/main'], {
    readCurrentPackageManifestAsync: () => Promise.resolve(input.currentManifest),
    readGitFileAsync: () => {
      if (input.readGitFileError !== undefined) return Promise.reject(input.readGitFileError);
      return Promise.resolve(input.baseManifest);
    },
    runExternalToolAsync: (argv) => {
      receivedArgv = argv;
      return Promise.resolve({ exitCode: 0 });
    },
  });

  return receivedArgv;
}
