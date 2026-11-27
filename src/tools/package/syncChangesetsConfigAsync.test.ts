import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from 'bun:test';

import { syncChangesetsConfigAsync } from './syncChangesetsConfigAsync.js';

test('plans a read-only initialization and initializes release configuration once', async () => {
  const target = await mkdtemp(join(tmpdir(), 'devtools-changesets-'));
  try {
    await writeFile(
      join(target, 'package.json'),
      JSON.stringify({ name: 'fixture', publishConfig: { access: 'public' } }),
    );
    const calls: string[] = [];
    const initialize = async (directory: string): Promise<void> => {
      calls.push(directory);
      await mkdir(join(directory, '.changeset'));
      await writeFile(join(directory, '.changeset/config.json'), '{}\n');
    };
    expect((await syncChangesetsConfigAsync(target, true, initialize))?.action).toBe(
      'would-create',
    );
    expect(calls).toEqual([]);
    expect((await syncChangesetsConfigAsync(target, false, initialize))?.action).toBe('created');
    expect((await syncChangesetsConfigAsync(target, false, initialize))?.action).toBe('unchanged');
    expect(calls).toEqual([target]);
    expect(await readFile(join(target, '.changeset/config.json'), 'utf8')).toBe('{}\n');
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});
