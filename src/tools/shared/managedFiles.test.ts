import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { inspectManagedFiles, syncManagedFiles } from './managedFiles.js';

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function fixtureRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'devtools-managed-'));
  tempRoots.push(root);
  return root;
}

describe('managed files', () => {
  it('creates missing files, updates drift, and is idempotent', () => {
    const root = fixtureRoot();
    const source = join(root, 'canonical.txt');
    writeFileSync(source, 'canonical\n');
    const definitions = [{ targetPath: '.config/example.txt', sourceUrl: new URL(`file://${source}`) }];

    expect(inspectManagedFiles(root, definitions)[0]?.state).toBe('missing');
    expect(syncManagedFiles(root, definitions)[0]?.action).toBe('created');
    expect(syncManagedFiles(root, definitions)[0]?.action).toBe('unchanged');

    writeFileSync(join(root, '.config/example.txt'), 'drift\n');
    expect(inspectManagedFiles(root, definitions)[0]?.state).toBe('outdated');
    expect(syncManagedFiles(root, definitions)[0]?.action).toBe('updated');
    expect(readFileSync(join(root, '.config/example.txt'), 'utf8')).toBe('canonical\n');
  });

  it('reports dry-run changes without writing', () => {
    const root = fixtureRoot();
    const source = join(root, 'canonical.txt');
    writeFileSync(source, 'canonical\n');
    const definitions = [{ targetPath: '.config/example.txt', sourceUrl: new URL(`file://${source}`) }];

    expect(syncManagedFiles(root, definitions, { dryRun: true })[0]?.action).toBe(
      'would-create',
    );
    expect(inspectManagedFiles(root, definitions)[0]?.state).toBe('missing');
  });
});
