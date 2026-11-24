import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

test('managed release executes Playwright Chromium setup for declared and absent dependencies', async () => {
  const release = await renderReleaseWorkflowAsync();
  const script = extractPlaywrightChromiumInstallation(release);
  const directory = await mkdtemp(join(tmpdir(), 'devtools-release-playwright-'));
  temporaryDirectories.push(directory);
  const binaryDirectory = join(directory, 'bin');
  const absentDirectory = join(directory, 'absent');
  const declaredDirectory = join(directory, 'declared');
  const cliPath = join(declaredDirectory, 'node_modules/playwright-core/cli.js');

  await createBunRecorderAsync(binaryDirectory);
  await mkdir(absentDirectory);
  await writeFile(join(absentDirectory, 'package.json'), '{}\n');
  await mkdir(join(declaredDirectory, 'node_modules/playwright-core'), { recursive: true });
  await writeFile(
    join(declaredDirectory, 'package.json'),
    `${JSON.stringify({ dependencies: { 'playwright-core': '1.0.0' } })}\n`,
  );
  await writeFile(
    join(declaredDirectory, 'node_modules/playwright-core/package.json'),
    `${JSON.stringify({
      exports: { './package.json': './package.json' },
    })}\n`,
  );
  await writeFile(cliPath, 'process.exit(0);\n');

  const absent = await runPlaywrightChromiumInstallationAsync({
    binaryDirectory,
    directory: absentDirectory,
    script,
  });
  expect(absent.exitCode).toBe(0);
  expect(absent.stdout).toContain(
    'No Playwright Core dependency declared; skipping Chromium installation.',
  );
  expect(absent.bunInvocation).toBe('');

  const declared = await runPlaywrightChromiumInstallationAsync({
    binaryDirectory,
    directory: declaredDirectory,
    script,
  });
  expect(declared.exitCode).toBe(0);
  expect(declared.bunInvocation).toBe(`${await realpath(cliPath)}\ninstall\nchromium\n`);
});

/*** Render the managed release workflow used as the executable probe source. */
async function renderReleaseWorkflowAsync(): Promise<string> {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }
  return releaseDefinition.render('.');
}

/*** Extract the exact rendered Playwright setup step before executing it in isolated fixtures. */
function extractPlaywrightChromiumInstallation(release: string): string {
  const match =
    /\s{6}- name: Install declared Playwright Chromium\n\s{8}run: \|\n(?<script>(?:\s{10}.+\n)+)/u.exec(
      release,
    );
  const script = match?.groups?.script;
  if (script === undefined)
    throw new Error('Missing declared Playwright Chromium installation step.');
  return script.replaceAll(/^\s{10}/gmu, '');
}

/*** Create a Bun boundary that records the workflow command without downloading a browser. */
async function createBunRecorderAsync(binaryDirectory: string): Promise<void> {
  await mkdir(binaryDirectory);
  await writeFile(
    join(binaryDirectory, 'bun'),
    '#!/bin/sh\nprintf "%s\\n" "$@" > "$BUN_INVOCATION"\n',
    { mode: 0o755 },
  );
}

/*** Execute the rendered setup step with the fake Bun boundary and capture its observable command. */
async function runPlaywrightChromiumInstallationAsync(input: {
  readonly binaryDirectory: string;
  readonly directory: string;
  readonly script: string;
}): Promise<{
  readonly bunInvocation: string;
  readonly exitCode: number;
  readonly stdout: string;
}> {
  const invocationPath = join(input.directory, 'bun-invocation.txt');
  const syntax = Bun.spawnSync(['bash', '-n', '-c', input.script], { stderr: 'pipe' });
  expect(syntax.exitCode).toBe(0);
  const subprocess = Bun.spawn(['bash', '-euo', 'pipefail', '-c', input.script], {
    cwd: input.directory,
    env: {
      ...process.env,
      BUN_INVOCATION: invocationPath,
      PATH: `${input.binaryDirectory}:${process.env.PATH ?? ''}`,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stdout] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stdout).text(),
  ]);
  return {
    bunInvocation: await readFile(invocationPath, 'utf8').catch(() => ''),
    exitCode,
    stdout,
  };
}
