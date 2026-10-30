import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

test('managed workflows freeze initial installs and independently verify npm publication integrity', async () => {
  const [ci, release] = await Promise.all([
    workflowManagedFiles[0].render?.('.'),
    workflowManagedFiles[1].render?.('.'),
  ]);
  if (ci === undefined || release === undefined) {
    throw new Error('Missing managed CI or release workflow renderer.');
  }

  expect(ci).toContain(
    '      - name: Install dependencies\n        run: bun install --frozen-lockfile',
  );
  expect(release).toContain(
    '      - name: Install dependencies\n        run: bun install --frozen-lockfile',
  );
  expect(release).toContain(
    'Changesets can intentionally update package metadata and the lockfile',
  );
  expect(release).toContain('          bun install --ignore-scripts');
  expect(release).toContain('timeout-minutes: 40');
  expect(release).toContain('max_attempts=60');
  expect(release).toContain('retry_seconds=30');
  expect(release).toContain(
    'npm view "$package_spec" name version dist.tarball dist.integrity --json',
  );
  expect(release).toContain('if [ "$package_name" != "$PUBLISHED_PACKAGE_NAME" ]');
  expect(release).toContain('[[ "$integrity" != sha512-* ]]');
  expect(release).toContain(
    'curl --fail --location --silent --show-error --output "$artifact" "$tarball"',
  );
  expect(release).toContain('createHash("sha512")');
  expect(release).toContain('npm registry authorization failed');
  expect(release).toContain('npm tarball authorization failed');
  expect(release).toContain('Registry propagation is still pending');
  expect(release).toContain('Tarball propagation is still pending');
  expect(release).toContain('network or registry error');
  expect(release).toContain('Wrong npm publication metadata');
  expect(release).toContain('Wrong npm tarball');
  expect(release).toContain('npm publication propagation timeout');
  expect(release).not.toContain('npm pack "$package_spec"');
});

test('executes publication metadata extraction as four values and rejects invalid publication evidence', async () => {
  const release = await workflowManagedFiles[1].render?.('.');
  if (release === undefined) throw new Error('Missing managed release workflow renderer.');

  const valid = await runPublicationVerification(release, 'valid');
  expect(valid.exitCode, valid.output).toBe(0);
  expect(valid.metadataValues.split('\n')).toEqual([
    '@scope/fixture',
    '1.2.3',
    'https://registry.example.test/fixture.tgz',
    `sha512-${createHash('sha512').update('fixture artifact').digest('base64')}`,
    '',
  ]);

  for (const scenario of ['incomplete-metadata', 'wrong-metadata', 'wrong-integrity'] as const) {
    expect((await runPublicationVerification(release, scenario)).exitCode).toBe(1);
  }

  const propagation = await runPublicationVerification(release, 'registry-propagation');
  expect(propagation.exitCode).toBe(1);
  expect(propagation.output).toContain('Registry propagation is still pending');
  expect(propagation.output).toContain('npm publication propagation timeout');
});

/*** Execute the rendered fresh-runner verification with deterministic registry and tarball fixtures. */
async function runPublicationVerification(
  release: string,
  scenario:
    'incomplete-metadata' | 'registry-propagation' | 'valid' | 'wrong-integrity' | 'wrong-metadata',
): Promise<{
  readonly exitCode: number;
  readonly metadataValues: string;
  readonly output: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'devtools-publication-verification-'));
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, 'bin');
  const artifactPath = join(directory, 'fixture.tgz');
  const metadataValuesPath = join(directory, 'npm-publish-verification.values');
  await Bun.write(artifactPath, 'fixture artifact');
  await Bun.write(
    join(directory, 'verify.sh'),
    `set -euo pipefail\n${extractPublicationVerification(release)}\n`,
  );
  await Bun.write(join(binDirectory, 'npm'), createNpmFixture());
  await Bun.write(join(binDirectory, 'curl'), createCurlFixture());
  await chmod(join(binDirectory, 'npm'), 0o755);
  await chmod(join(binDirectory, 'curl'), 0o755);

  const subprocess = Bun.spawn(['bash', join(directory, 'verify.sh')], {
    cwd: directory,
    env: {
      ...process.env,
      FIXTURE_TARBALL: artifactPath,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      PUBLISHED_PACKAGE_NAME: '@scope/fixture',
      PUBLISHED_PACKAGE_VERSION: '1.2.3',
      RUNNER_TEMP: directory,
      VERIFICATION_SCENARIO: scenario,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr] = await Promise.all([
    new Response(subprocess.stdout).text(),
    new Response(subprocess.stderr).text(),
  ]);
  return {
    exitCode: await subprocess.exited,
    metadataValues: await readFile(metadataValuesPath, 'utf8').catch(() => ''),
    output: `${stdout}${stderr}`,
  };
}

/*** Extract the rendered fresh-runner shell body and reduce propagation retries for deterministic tests. */
function extractPublicationVerification(release: string): string {
  const match =
    / {6}- name: Verify published npm artifact from a fresh runner\n[\s\S]*? {8}run: \|\n([\s\S]*?)\n {2}finalize:/u.exec(
      release,
    );
  if (match?.[1] === undefined)
    throw new Error('Expected rendered publication verification shell step.');
  return match[1]
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n')
    .replace('max_attempts=60', 'max_attempts=1')
    .replace('retry_seconds=30', 'retry_seconds=0');
}

/*** Create an npm command fixture for valid, malformed, and propagation-pending metadata. */
function createNpmFixture(): string {
  const integrity = createHash('sha512').update('fixture artifact').digest('base64');
  return `#!/usr/bin/env bash\ncase "${'$'}VERIFICATION_SCENARIO" in\n  valid) printf '%s' '${JSON.stringify({ 'dist.integrity': `sha512-${integrity}`, 'dist.tarball': 'https://registry.example.test/fixture.tgz', name: '@scope/fixture', version: '1.2.3' })}' ;;\n  incomplete-metadata) printf '%s' '${JSON.stringify({ 'dist.integrity': `sha512-${integrity}`, name: '@scope/fixture', version: '1.2.3' })}' ;;\n  wrong-metadata) printf '%s' '${JSON.stringify({ 'dist.integrity': `sha512-${integrity}`, 'dist.tarball': 'https://registry.example.test/fixture.tgz', name: '@scope/other', version: '1.2.3' })}' ;;\n  wrong-integrity) printf '%s' '${JSON.stringify({ 'dist.integrity': 'sha512-invalid', 'dist.tarball': 'https://registry.example.test/fixture.tgz', name: '@scope/fixture', version: '1.2.3' })}' ;;\n  registry-propagation) printf '%s\\n' 'npm error code E404' >&2; exit 1 ;;\nesac\n`;
}

/*** Create a curl fixture that writes the exact deterministic tarball bytes requested by the workflow. */
function createCurlFixture(): string {
  return `#!/usr/bin/env bash\nwhile [ "${'$'}#" -gt 0 ]; do\n  if [ "${'$'}1" = '--output' ]; then output="${'$'}2"; shift 2; continue; fi\n  shift\ndone\ncp "${'$'}FIXTURE_TARBALL" "${'$'}output"\n`;
}
