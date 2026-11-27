import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { initializeBootstrapChangesetsAsync } from './initializeBootstrapChangesetsAsync.js';

test('plans and initializes only missing Changesets files', async () => {
  const target = await mkdtemp(join(tmpdir(), 'devtools-bootstrap-config-'));
  try {
    const directory = join(target, '.changeset');
    const config = join(directory, 'config.json');
    const pending = join(directory, 'pending-release.md');
    const preview = await initializeBootstrapChangesetsAsync(target, 'main', true);

    expect(preview.map(({ action }) => action)).toEqual(['would-create', 'would-create']);
    expect(await Bun.file(config).exists()).toBe(false);
    await mkdir(directory);
    await writeFile(pending, 'Authored release notes.\n');
    const initial = await initializeBootstrapChangesetsAsync(target, 'main', false);
    expect(initial.map(({ action }) => action)).toEqual(['created', 'created']);
    expect(JSON.parse(await readFile(config, 'utf8'))).toMatchObject({
      access: 'public',
      baseBranch: 'main',
    });

    await writeFile(config, '{"baseBranch":"custom"}\n');
    const repeated = await initializeBootstrapChangesetsAsync(target, 'main', false);
    expect(repeated.map(({ action }) => action)).toEqual(['unchanged', 'unchanged']);
    expect(await readFile(config, 'utf8')).toBe('{"baseBranch":"custom"}\n');
    expect(await readFile(pending, 'utf8')).toBe('Authored release notes.\n');
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
