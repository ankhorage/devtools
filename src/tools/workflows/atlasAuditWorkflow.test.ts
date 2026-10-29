import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { afterEach, expect, test } from 'bun:test';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('the published Atlas command writes an uploadable report before blocking a workspace cycle', async () => {
  const fixture = await createAtlasCycleFixtureAsync();
  const result = await runAtlasAuditAsync(fixture);

  expect(result.exitCode).toBe(2);
  expect(await Bun.file(join(fixture, 'src/atlas-audit.json')).exists()).toBe(true);
});

/*** Create a source-tree workspace whose package imports form a cycle. */
async function createAtlasCycleFixtureAsync(): Promise<string> {
  const directory = await mkdtemp('/tmp/devtools-atlas-cycle-');
  temporaryDirectories.push(directory);
  const sourceDirectory = join(directory, 'src');
  await mkdir(join(sourceDirectory, 'packages/a'), { recursive: true });
  await mkdir(join(sourceDirectory, 'packages/b'), { recursive: true });
  await writeFixtureFilesAsync(sourceDirectory);
  return directory;
}

/*** Write workspace package metadata and source imports for the cycle fixture. */
async function writeFixtureFilesAsync(sourceDirectory: string): Promise<void> {
  await Promise.all([
    writeFile(
      join(sourceDirectory, 'package.json'),
      `${JSON.stringify({ name: 'atlas-cycle-source', private: true, workspaces: ['packages/*'] })}\n`,
    ),
    writeFile(
      join(sourceDirectory, 'packages/a/package.json'),
      `${JSON.stringify({ name: '@fixture/a', version: '1.0.0', dependencies: { '@fixture/b': '1.0.0' } })}\n`,
    ),
    writeFile(
      join(sourceDirectory, 'packages/a/index.ts'),
      "import { b } from '@fixture/b';\n\nexport const a = `a:${b}`;\n",
    ),
    writeFile(
      join(sourceDirectory, 'packages/b/package.json'),
      `${JSON.stringify({ name: '@fixture/b', version: '1.0.0', dependencies: { '@fixture/a': '1.0.0' } })}\n`,
    ),
    writeFile(
      join(sourceDirectory, 'packages/b/index.ts'),
      "import { a } from '@fixture/a';\n\nexport const b = `b:${a}`;\n",
    ),
  ]);
}

/*** Execute the exact Atlas command published by Rules Repository. */
async function runAtlasAuditAsync(directory: string): Promise<{ readonly exitCode: number }> {
  const subprocess = Bun.spawn(['sh', '-c', REPOSITORY_RULE_METADATA.atlasAudit.command], {
    cwd: directory,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ]);
  if (exitCode !== 2) throw new Error(stderr);
  return { exitCode };
}
