import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it } from 'bun:test';

import {
  inspectManagedFiles,
  resolveManagedTargetDirectory,
  syncManagedFiles,
  type ManagedFileDefinition,
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

    expect(
      await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: false }),
    ).toEqual([{ relativePath: '.managed/example.txt', action: 'created' }]);
    expect(await readFile(join(fixture.target, '.managed/example.txt'), 'utf8')).toBe(
      'canonical\n',
    );
    expect(await readFile(join(fixture.target, 'unrelated.txt'), 'utf8')).toBe('keep me\n');

    await writeFile(join(fixture.target, '.managed/example.txt'), 'outdated\n');
    expect(
      await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: false }),
    ).toEqual([{ relativePath: '.managed/example.txt', action: 'updated' }]);
    expect(
      await syncManagedFiles(fixture.target, fixture.definitions, { dryRun: false }),
    ).toEqual([{ relativePath: '.managed/example.txt', action: 'unchanged' }]);
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
    await expect(
      resolveManagedTargetDirectory(fixture.target, 'does-not-exist'),
    ).rejects.toThrow('Target directory does not exist');
  });
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
