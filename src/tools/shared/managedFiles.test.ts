import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, test } from 'bun:test';

import {
  inspectManagedFiles,
  type ManagedFileDefinition,
  resolveManagedTargetDirectory,
  syncManagedFiles,
} from './managedFiles.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('managed file synchronization', () => {
  it('creates, updates, preserves unrelated files, and becomes idempotent', async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.target, 'unrelated.txt'), 'keep me\n');

    expect(await inspectManagedFiles(fixture.target, fixture.definitions)).toEqual([
      { relativePath: '.managed/example.txt', state: 'missing' },
    ]);
    expect(await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: false })).toEqual([
      { relativePath: '.managed/example.txt', action: 'created' },
    ]);
    expect(await readFile(join(fixture.target, '.managed/example.txt'), 'utf8')).toBe(
      'canonical\n',
    );
    expect(await readFile(join(fixture.target, 'unrelated.txt'), 'utf8')).toBe('keep me\n');

    await writeFile(join(fixture.target, '.managed/example.txt'), 'outdated\n');
    expect(await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: false })).toEqual([
      { relativePath: '.managed/example.txt', action: 'updated' },
    ]);
    expect(await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: false })).toEqual([
      { relativePath: '.managed/example.txt', action: 'unchanged' },
    ]);
  });

  it('reports dry-run actions without writing files', async () => {
    const fixture = await createFixture();

    expect(await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: true })).toEqual([
      { relativePath: '.managed/example.txt', action: 'would-create' },
    ]);
    expect(await inspectManagedFiles(fixture.target, fixture.definitions)).toEqual([
      { relativePath: '.managed/example.txt', state: 'missing' },
    ]);
  });

  it('defaults targets to cwd and rejects invalid targets', async () => {
    const fixture = await createFixture();
    expect(await resolveManagedTargetDirectory(fixture.target, undefined)).toBe(fixture.target);

    let thrownError: unknown;
    try {
      await resolveManagedTargetDirectory(fixture.target, 'does-not-exist');
    } catch (error) {
      thrownError = error;
    }

    if (!(thrownError instanceof Error)) {
      throw new Error('Expected resolveManagedTargetDirectory to throw an Error.');
    }
    expect(thrownError.message).toContain('Target directory does not exist');
  });
});

test('create-only managed files preserve repository-owned edits', async () => {
  const fixture = await createFixture();
  const definitions = fixture.definitions.map((definition) => ({
    ...definition,
    mode: 'create-only' as const,
  }));

  await syncManagedFiles(fixture.target, definitions, { dryRun: false });
  await writeFile(join(fixture.target, '.managed/example.txt'), 'custom\n');
  expect(await inspectManagedFiles(fixture.target, definitions)).toEqual([
    { relativePath: '.managed/example.txt', state: 'current' },
  ]);
  expect(await syncManagedFiles(fixture.target, definitions, { dryRun: false })).toEqual([
    { relativePath: '.managed/example.txt', action: 'unchanged' },
  ]);
  expect(await readFile(join(fixture.target, '.managed/example.txt'), 'utf8')).toBe('custom\n');
});

test('rendered managed files can derive canonical content from the target repository', async () => {
  const fixture = await createFixture();
  const definitions: readonly ManagedFileDefinition[] = [
    {
      relativePath: '.managed/rendered.txt',
      render: (targetDirectory) => `target=${targetDirectory}\n`,
    },
  ];

  await syncManagedFiles(fixture.target, definitions, { dryRun: false });
  expect(await readFile(join(fixture.target, '.managed/rendered.txt'), 'utf8')).toBe(
    `target=${fixture.target}\n`,
  );
});

async function createFixture(): Promise<{
  readonly target: string;
  readonly definitions: readonly ManagedFileDefinition[];
}> {
  const root = await mkdtemp('/tmp/devtools-managed-files-');
  temporaryDirectories.push(root);
  const canonical = join(root, 'canonical.txt');
  const target = join(root, 'target');
  await Bun.write(canonical, 'canonical\n');
  await mkdir(target);
  await writeFile(join(target, '.keep'), '');

  return {
    target,
    definitions: [
      {
        relativePath: '.managed/example.txt',
        sourceUrl: pathToFileURL(canonical),
      },
    ],
  };
}
