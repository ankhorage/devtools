import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { runRepositoryMetadataCommandAsync } from './runRepositoryMetadataCommandAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('bootstraps only missing source-profile metadata and reports author-owned tasks', async () => {
  const target = await createTargetAsync(true);
  const output: string[] = [];

  const result = await runRepositoryMetadataCommandAsync('init', [], context(target, output));

  expect(result.exitCode).toBe(1);
  expect(await readFile(join(target, 'src/metadata/repository.json'), 'utf8')).toContain(
    '"title": "fixture"',
  );
  expect(output.join('')).toContain('create structurally valid repository metadata');
});

test('preserves existing metadata, supports deterministic dry-run, and handles non-source repositories', async () => {
  const sourceTarget = await createTargetAsync(true);
  const nonSourceTarget = await createTargetAsync(false);
  const output: string[] = [];
  await mkdir(join(sourceTarget, 'src/metadata'), { recursive: true });
  await writeFile(join(sourceTarget, 'src/metadata/repository.json'), validMetadata);

  expect(
    (await runRepositoryMetadataCommandAsync('init', [], context(sourceTarget, output))).exitCode,
  ).toBe(0);
  expect(await readFile(join(sourceTarget, 'src/metadata/repository.json'), 'utf8')).toBe(
    validMetadata,
  );
  expect(
    (
      await runRepositoryMetadataCommandAsync(
        'init',
        ['--dry-run'],
        context(nonSourceTarget, output),
      )
    ).exitCode,
  ).toBe(1);
  expect(await Bun.file(join(nonSourceTarget, 'metadata/repository.json')).exists()).toBe(false);
  expect(output.join('')).toContain('metadata/repository.json');
});

test('preserves invalid partial metadata while reporting it without network access or enforcement', async () => {
  const target = await createTargetAsync(true);
  const output: string[] = [];
  await mkdir(join(target, 'src/metadata'), { recursive: true });
  await writeFile(
    join(target, 'src/metadata/repository.json'),
    '{"schemaVersion":1,"kind":"tooling"}\n',
  );

  const result = await runRepositoryMetadataCommandAsync('init', [], context(target, output));

  expect(result.exitCode).toBe(1);
  expect(await readFile(join(target, 'src/metadata/repository.json'), 'utf8')).toBe(
    '{"schemaVersion":1,"kind":"tooling"}\n',
  );
  expect(output.join('')).toContain('create structurally valid repository metadata');
});

test('preserves complete implementation references so Rules reports malformed public paths', async () => {
  const target = await createTargetAsync(true);
  const output: string[] = [];
  await mkdir(join(target, 'src/metadata'), { recursive: true });
  await writeFile(
    join(target, 'src/metadata/repository.json'),
    validMetadata.replace(
      '"purpose": "Verify repository metadata authoring behavior."',
      '"purpose": "Verify repository metadata authoring behavior.",\n  "implements": [{"packageName":"@ankhorage/contracts","subpath":"metadata"}]',
    ),
  );

  const result = await runRepositoryMetadataCommandAsync('status', [], context(target, output));

  expect(result.exitCode).toBe(1);
  expect(output.join('')).toContain('Implementation references require a package name');
});

/*** Create a local repository fixture with an optional source directory. */
async function createTargetAsync(withSource: boolean): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-repository-metadata-');
  temporaryDirectories.push(target);
  await writeFile(join(target, 'package.json'), '{"name":"fixture"}\n');
  if (withSource) await mkdir(join(target, 'src'));
  return target;
}

/*** Build a deterministic CLI context that records user-visible output. */
function context(target: string, output: string[]) {
  return {
    cwd: target,
    writeStderr: (text: string) => output.push(text),
    writeStdout: (text: string) => output.push(text),
  };
}

const validMetadata = `${JSON.stringify(
  {
    schemaVersion: 1,
    kind: 'tooling',
    title: 'Fixture',
    summary: 'Provides deterministic test tooling.',
    purpose: 'Verify repository metadata authoring behavior.',
  },
  null,
  2,
)}\n`;
