import { randomUUID } from 'node:crypto';
import { chmod, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

test('keeps the opt-in pre-publish snapshot gate before Changesets versioning', async () => {
  const workflow = await readFile(new URL('./files/release.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('pre-publish-release-wave-snapshot');
  expect(workflow).toContain("ANKHORAGE_PRE_PUBLISH_SNAPSHOT_GATE_ENABLED == 'true'");
  expect(workflow).toContain('Release-wave ACK timeout');
  expect(workflow.indexOf('Acknowledge immutable pre-publish release-wave snapshot')).toBeLessThan(
    workflow.indexOf('Version packages directly on main'),
  );
  expect(workflow).toContain('changesets-status-recheck.json');
});

test('executes the rendered release-intent gate for explicit no-op and invalid Changesets evidence', async () => {
  const workflow = await readFile(new URL('./files/release.yml', import.meta.url), 'utf8');
  const script = extractReleaseIntentValidator(workflow);
  const directory = await mkdtemp(join(tmpdir(), 'devtools-pre-publish-intent-'));

  await expectReleaseIntentAsync({
    directory,
    script,
    status: { releases: [] },
    expected: 'false',
  });
  await expectReleaseIntentAsync({
    directory,
    script,
    status: {
      releases: [
        { changesets: ['correct'], name: '@example/package', newVersion: '1.0.1', type: 'patch' },
      ],
    },
    expected: 'true',
  });
  await expectReleaseIntentFailureAsync({ directory, script, status: {} });
  await expectReleaseIntentFailureAsync({ directory, script, status: { releases: [{}, {}] } });
});

test('executes the rendered ACK reader with retryable absence and rejected Renovate access', async () => {
  const workflow = await readFile(new URL('./files/release.yml', import.meta.url), 'utf8');
  const reader = extractAckReader(workflow);
  const directory = await mkdtemp(join(tmpdir(), 'devtools-pre-publish-ack-'));
  const binDirectory = join(directory, 'bin');
  await mkdir(binDirectory);
  const curlPath = join(binDirectory, 'curl');
  await writeFile(
    curlPath,
    `#!/bin/sh
output=''
while [ "$#" -gt 0 ]; do
  if [ "$1" = '--output' ]; then output="$2"; shift 2; continue; fi
  shift
done
printf '%s' "$FAKE_ACK_BODY" > "$output"
printf '%s' "$FAKE_HTTP_STATUS"
`,
  );
  await chmod(curlPath, 0o755);

  const absent = runAckReader({ binDirectory, directory, reader, status: '404' });
  expect(absent.exitCode).toBe(0);
  expect(new TextDecoder().decode(absent.stdout)).toBe('ack=');

  const denied = runAckReader({
    binDirectory,
    directory,
    reader,
    status: '403',
    body: '{"message":"Resource not accessible by integration"}',
  });
  expect(denied.exitCode).not.toBe(0);
  expect(new TextDecoder().decode(denied.stdout)).toContain('Release-wave ACK read rejected');
});

/*** Extract the shell-embedded validator so its actual behavior, not a duplicate, is exercised. */
function extractReleaseIntentValidator(workflow: string): string {
  const marker = 'release_intent="$(CHANGESETS_STATUS_PATH="$changesets_status_path" node -e \'\n';
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf('\n          \'")"', start + marker.length);
  if (start === -1 || end === -1) throw new Error('Missing pre-publish release-intent validator.');
  return workflow.slice(start + marker.length, end);
}

/*** Extract the workflow's HTTP result handling so permission failures cannot be mistaken for an ACK timeout. */
function extractAckReader(workflow: string): string {
  const marker = '            ack_path="$RUNNER_TEMP/release-wave-ack.json"';
  const start = workflow.indexOf(marker);
  const end = workflow.indexOf('\n            if [ -n "$ack" ]', start);
  if (start === -1 || end === -1) throw new Error('Missing pre-publish ACK reader.');
  return workflow.slice(start, end);
}

/*** Execute the exact workflow validator against one persisted Changesets status document. */
async function expectReleaseIntentAsync(input: {
  readonly directory: string;
  readonly expected: string;
  readonly script: string;
  readonly status: unknown;
}): Promise<void> {
  const statusPath = join(input.directory, `${input.expected}.json`);
  await writeFile(statusPath, `${JSON.stringify(input.status)}\n`);
  const result = Bun.spawnSync(['node', '-e', input.script], {
    env: { ...process.env, CHANGESETS_STATUS_PATH: statusPath },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(result.exitCode).toBe(0);
  expect(new TextDecoder().decode(result.stdout)).toBe(input.expected);
}

/*** Prove malformed or ambiguous evidence fails before it can skip the publisher gate. */
async function expectReleaseIntentFailureAsync(input: {
  readonly directory: string;
  readonly script: string;
  readonly status: unknown;
}): Promise<void> {
  const statusPath = join(input.directory, `${randomUUID()}.json`);
  await writeFile(statusPath, `${JSON.stringify(input.status)}\n`);
  const result = Bun.spawnSync(['node', '-e', input.script], {
    env: { ...process.env, CHANGESETS_STATUS_PATH: statusPath },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  expect(result.exitCode).not.toBe(0);
}

/*** Run the exact ACK-reader shell fragment against a deterministic local curl substitute. */
function runAckReader(input: {
  readonly binDirectory: string;
  readonly body?: string;
  readonly directory: string;
  readonly reader: string;
  readonly status: string;
}): ReturnType<typeof Bun.spawnSync> {
  return Bun.spawnSync(['sh', '-c', `${input.reader}\nprintf 'ack=%s' "$ack"`], {
    env: {
      ...process.env,
      FAKE_ACK_BODY: input.body ?? '',
      FAKE_HTTP_STATUS: input.status,
      PATH: `${input.binDirectory}:${process.env.PATH ?? ''}`,
      RELEASE_WAVE_STATE_BRANCH: 'release-wave-state',
      RUNNER_TEMP: input.directory,
      request_id: 'request',
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
}
