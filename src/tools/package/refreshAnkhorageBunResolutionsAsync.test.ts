import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { refreshAnkhorageBunResolutionsAsync } from './refreshAnkhorageBunResolutionsAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

test('refreshes Ankhorage lock resolutions without changing package.json ownership', async () => {
  const root = await mkdtemp('/tmp/devtools-ankh-lock-');
  temporaryDirectories.push(root);
  const packagePath = path.join(root, 'package.json');
  const original = `${JSON.stringify(
    {
      name: 'fixture',
      dependencies: {
        '@ankhorage/contracts': '^22.8.102',
        react: '^19.2.0',
      },
      devDependencies: {
        '@ankhorage/devtools': '^2.1.12',
      },
    },
    null,
    2,
  )}\n`;
  await writeFile(packagePath, original, 'utf8');

  const recorded: string[][] = [];
  await refreshAnkhorageBunResolutionsAsync(root, async (args) => {
    recorded.push([...args]);
    if (args[0] === 'update') {
      const changed = JSON.parse(await readFile(packagePath, 'utf8')) as Record<string, unknown>;
      await writeFile(
        packagePath,
        `${JSON.stringify({ ...changed, touchedByBunUpdate: true }, null, 2)}\n`,
        'utf8',
      );
    }
  });

  expect(recorded).toEqual([
    ['install', '--lockfile-only', '--ignore-scripts'],
    ['update', '@ankhorage/*', '--lockfile-only', '--ignore-scripts'],
    ['install', '--lockfile-only', '--ignore-scripts'],
  ]);
  expect(await readFile(packagePath, 'utf8')).toBe(original);
});

test('restores package.json when Bun update fails', async () => {
  const root = await mkdtemp('/tmp/devtools-ankh-lock-');
  temporaryDirectories.push(root);
  const packagePath = path.join(root, 'package.json');
  const original = '{"name":"fixture","devDependencies":{"@ankhorage/devtools":"^2.1.12"}}\n';
  await writeFile(packagePath, original, 'utf8');

  await expect(
    refreshAnkhorageBunResolutionsAsync(root, async (args) => {
      if (args[0] === 'update') {
        await writeFile(packagePath, '{"name":"changed"}\n', 'utf8');
        throw new Error('resolver failed');
      }
    }),
  ).rejects.toThrow('resolver failed');

  expect(await readFile(packagePath, 'utf8')).toBe(original);
});
