import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { createKnipConfig, createKnipMonorepoConfig } from './tools/knip/index.js';
import { MANAGED_SKILL_EXECUTABLE_GLOB } from './tools/skills/manifest.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map(async (directory) => {
      await rm(directory, { force: true, recursive: true });
    }),
  );
});

describe('createKnipConfig', () => {
  it('keeps zero-config discovery while excluding Devtools-managed skill executables', () => {
    expect(createKnipConfig()).toEqual({
      ignoreFiles: [MANAGED_SKILL_EXECUTABLE_GLOB],
    });
  });

  it('uses explicit repo-specific config when provided', () => {
    expect(
      createKnipConfig({
        entry: ['scripts/release.ts'],
        project: ['scripts/**/*.ts'],
        ignore: ['fixtures/**'],
        ignoreBinaries: ['eslint', 'prettier'],
        ignoreDependencies: ['optional-package'],
        ignoreFiles: ['examples/package/prettier.config.cjs'],
      }),
    ).toEqual({
      entry: ['scripts/release.ts'],
      project: ['scripts/**/*.ts'],
      ignore: ['fixtures/**'],
      ignoreBinaries: ['eslint', 'prettier'],
      ignoreDependencies: ['optional-package'],
      ignoreFiles: [MANAGED_SKILL_EXECUTABLE_GLOB, 'examples/package/prettier.config.cjs'],
    });
  });

  it('deduplicates the managed skill exclusion when a repository lists it locally', () => {
    expect(
      createKnipConfig({
        ignoreFiles: [MANAGED_SKILL_EXECUTABLE_GLOB, '.agents/skills/custom/scripts/**'],
      }),
    ).toEqual({
      ignoreFiles: [MANAGED_SKILL_EXECUTABLE_GLOB, '.agents/skills/custom/scripts/**'],
    });
  });

  it('lets Knip ignore a representative managed skill executable', async () => {
    const target = await createKnipFixture();
    const result = await runKnip(target);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain('audit.mjs');
    expect(result.stderr).not.toContain('audit.mjs');
  });
});

describe('createKnipMonorepoConfig', () => {
  it('keeps the managed skill executable exclusion for every workspace topology', () => {
    expect(createKnipMonorepoConfig()).toMatchObject({
      ignoreFiles: [MANAGED_SKILL_EXECUTABLE_GLOB],
      workspaces: {
        '.': {},
        'packages/*': {},
        'apps/*': {},
      },
    });
  });
});

/*** Create an isolated consumer fixture with one managed executable skill file. */
async function createKnipFixture(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-knip-');
  temporaryDirectories.push(target);
  await mkdir(join(target, 'src'), { recursive: true });
  await mkdir(join(target, '.agents/skills/zora-designer/scripts'), { recursive: true });
  await writeFile(join(target, 'package.json'), '{"name":"knip-fixture","type":"module"}\n');
  await writeFile(join(target, 'src/index.ts'), 'export const fixture = true;\n');
  await writeFile(
    join(target, '.agents/skills/zora-designer/scripts/audit.mjs'),
    'export const audit = true;\n',
  );
  await writeFile(
    join(target, 'knip.json'),
    `${JSON.stringify(createKnipConfig({ entry: ['src/index.ts'] }), null, 2)}\n`,
  );
  return target;
}

/*** Run the locally installed Knip binary against an isolated fixture. */
async function runKnip(
  cwd: string,
): Promise<{ readonly exitCode: number; readonly stderr: string; readonly stdout: string }> {
  const process = Bun.spawn({
    cmd: [
      'bun',
      `${import.meta.dirname}/../node_modules/knip/bin/knip.js`,
      '--config',
      'knip.json',
    ],
    cwd,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stderr, stdout };
}
