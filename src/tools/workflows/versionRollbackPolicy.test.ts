import { chmod, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('managed CI executes stable SemVer rollback checks against rendered Node policy', async () => {
  const ci = await renderWorkflowAsync(0);
  const policy = extractNodePolicy(ci, 'BASE_VERSION="$base_version"');

  expect(ci).toContain('Reject package version rollback');
  await expectVersionPolicy(policy, '2.3.14', '2.3.14', 0);
  await expectVersionPolicy(policy, '2.3.14', '2.3.15', 0);
  await expectVersionPolicy(policy, '2.3.14', '2.3.13', 1);
  await expectVersionPolicy(policy, '12.34.56', '12.35.0', 0);
  await expectVersionPolicy(policy, '2.3.14', '2.3.14-beta.1', 1);
});

test('managed release baseline executes only proven first-publish E404 cases without a version', async () => {
  const release = await renderWorkflowAsync(1);
  const baseline = extractWorkflowStep(release, 'Verify npm release baseline');

  const firstPublish = await runReleaseBaseline(baseline, 'first-publish', '1.0.0');
  expect(firstPublish.exitCode).toBe(0);
  expect(firstPublish.output).toBe('highest_published_version=\n');

  const published = await runReleaseBaseline(baseline, 'published', '10.12.1');
  expect(published.exitCode).toBe(0);
  expect(published.output).toBe('highest_published_version=10.12.0\n');

  expect((await runReleaseBaseline(baseline, 'published', '10.11.99')).exitCode).toBe(1);

  for (const scenario of ['network', 'auth', 'invalid'] as const) {
    const result = await runReleaseBaseline(baseline, scenario, '1.0.0');
    expect(result.exitCode).toBe(1);
  }
});

test('managed release executes strict published-version recovery policy', async () => {
  const release = await renderWorkflowAsync(1);
  const policy = extractNodePolicy(release, 'CANDIDATE_VERSION="$after_version"');

  await expectPublishedVersionPolicy(policy, '25.7.0', '25.7.0', 1);
  await expectPublishedVersionPolicy(policy, '25.6.9', '25.7.0', 1);
  await expectPublishedVersionPolicy(policy, '25.7.1', '25.7.0', 0);
});

/*** Render one managed workflow by its canonical definition index. */
async function renderWorkflowAsync(index: number): Promise<string> {
  const workflow = await workflowManagedFiles[index]?.render?.('.');
  if (workflow === undefined) throw new Error('Expected a managed workflow renderer.');
  return workflow;
}

/*** Extract the exact single-quoted Node program embedded in a rendered workflow. */
function extractNodePolicy(workflow: string, marker: string): string {
  const start = workflow.indexOf(marker);
  const sourceStart = workflow.indexOf("node -e '\n", start) + "node -e '\n".length;
  const sourceEnd = ["\n          '", "\n            '"]
    .map((delimiter) => workflow.indexOf(delimiter, sourceStart))
    .find((index) => index !== -1);
  if (start === -1 || sourceStart === -1 || sourceEnd === undefined) {
    throw new Error('Expected rendered Node policy.');
  }
  return workflow.slice(sourceStart, sourceEnd);
}

/*** Execute the rendered CI Node policy with one base/candidate version pair. */
async function expectVersionPolicy(
  policy: string,
  baseVersion: string,
  candidateVersion: string,
  expectedExitCode: number,
): Promise<void> {
  const subprocess = Bun.spawn(['node', '-e', policy], {
    env: {
      ...process.env,
      BASE_VERSION: baseVersion,
      CANDIDATE_VERSION: candidateVersion,
    },
    stderr: 'pipe',
  });
  expect(await subprocess.exited).toBe(expectedExitCode);
}

/*** Execute the rendered release policy against the highest known published version. */
async function expectPublishedVersionPolicy(
  policy: string,
  candidateVersion: string,
  highestPublishedVersion: string,
  expectedExitCode: number,
): Promise<void> {
  const subprocess = Bun.spawn(['node', '-e', policy], {
    env: {
      ...process.env,
      CANDIDATE_VERSION: candidateVersion,
      HIGHEST_PUBLISHED_VERSION: highestPublishedVersion,
    },
    stderr: 'pipe',
  });
  expect(await subprocess.exited).toBe(expectedExitCode);
}

/*** Extract one block-scalar shell step from a rendered workflow. */
function extractWorkflowStep(workflow: string, name: string): string {
  const stepStart = workflow.indexOf(`      - name: ${name}`);
  const runStart = workflow.indexOf('        run: |\n', stepStart);
  const stepEnd = workflow.indexOf('\n      - name:', runStart + 1);
  if (stepStart === -1 || runStart === -1 || stepEnd === -1) {
    throw new Error(`Expected rendered ${name} step.`);
  }
  return workflow
    .slice(runStart + '        run: |\n'.length, stepEnd)
    .split('\n')
    .map((line) => line.slice(10))
    .join('\n');
}

/*** Execute the rendered release-baseline shell step against a deterministic npm fixture. */
async function runReleaseBaseline(
  baseline: string,
  scenario: 'auth' | 'first-publish' | 'invalid' | 'network' | 'published',
  version: string,
): Promise<{ readonly exitCode: number; readonly output: string }> {
  const directory = await mkdtemp('/tmp/devtools-release-baseline-');
  temporaryDirectories.push(directory);
  const binDirectory = join(directory, 'bin');
  const outputPath = join(directory, 'github-output');
  await mkdir(binDirectory);
  await Bun.write(
    join(directory, 'package.json'),
    JSON.stringify({ name: '@scope/fixture', version }),
  );
  await Bun.write(join(directory, 'baseline.sh'), `set -euo pipefail\n${baseline}\n`);
  await Bun.write(
    join(binDirectory, 'npm'),
    `#!/usr/bin/env bash\ncase "${'$'}NPM_SCENARIO" in\n  first-publish) printf '%s\\n' 'npm error code E404' 'npm error 404 Not Found - GET https://registry.npmjs.org/%40scope%2Ffixture - Not found' "npm error 404  '@scope/fixture@*' is not in this registry." >&2; exit 1 ;;\n  published) printf '%s' '["2.3.14","10.12.0","2.9.99"]' ;;\n  network) printf '%s\\n' 'npm error code ECONNRESET' 'npm error network reset' >&2; exit 1 ;;\n  auth) printf '%s\\n' 'npm error code E401' 'npm error Unable to authenticate' >&2; exit 1 ;;\n  invalid) printf '%s' '{"error":{"code":"E404"}}' ;;\nesac\n`,
  );
  await chmod(join(binDirectory, 'npm'), 0o755);
  const subprocess = Bun.spawn(['bash', join(directory, 'baseline.sh')], {
    cwd: directory,
    env: {
      ...process.env,
      GITHUB_OUTPUT: outputPath,
      NPM_SCENARIO: scenario,
      PATH: `${binDirectory}:${process.env.PATH ?? ''}`,
      RUNNER_TEMP: directory,
    },
    stderr: 'pipe',
  });
  const exitCode = await subprocess.exited;
  const outputFile = Bun.file(outputPath);
  const output = (await outputFile.exists()) ? await outputFile.text() : '';
  return { exitCode, output };
}
