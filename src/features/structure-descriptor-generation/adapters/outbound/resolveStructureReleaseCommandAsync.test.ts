import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { resolveStructureReleaseCommandAsync } from './resolveStructureReleaseCommandAsync.js';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true })));
});

test('uses built self CLI for Devtools and installed bin for consumers', async () => {
  expect(await resolveStructureReleaseCommandAsync('.')).toBe(
    'node ./dist/cli/bin/structure.js',
  );

  const target = await mkdtemp('/tmp/devtools-structure-release-');
  roots.push(target);
  await mkdir(target, { recursive: true });
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify({ name: '@ankhorage/contracts', version: '1.0.0' }),
  );

  expect(await resolveStructureReleaseCommandAsync(target)).toBe(
    './node_modules/.bin/ankhorage-structure',
  );
});
