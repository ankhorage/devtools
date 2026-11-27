import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  inspectManagedFiles,
  syncManagedFiles,
} from '../../features/managed-files/managedFiles.js';
import { vscodeManagedFiles } from './index.js';

const targets: string[] = [];

afterEach(async () => {
  await Promise.all(
    targets.splice(0).map((target) => rm(target, { force: true, recursive: true })),
  );
});

test('installs the universal Bun launch and preserves custom debug configuration', async () => {
  const target = await mkdtemp(join(tmpdir(), 'devtools-vscode-'));
  targets.push(target);
  const launch = join(target, '.vscode/launch.json');

  expect(await syncManagedFiles(target, vscodeManagedFiles, { dryRun: true })).toContainEqual({
    relativePath: '.vscode/launch.json',
    action: 'would-create',
  });
  expect(await Bun.file(launch).exists()).toBe(false);
  await syncManagedFiles(target, vscodeManagedFiles, { dryRun: false });
  const contents = await readFile(launch, 'utf8');
  expect(JSON.parse(contents)).toEqual({
    version: '0.2.0',
    configurations: [
      {
        name: 'Debug Active File with Bun',
        type: 'bun',
        request: 'launch',
        program: '${file}',
        cwd: '${workspaceFolder}',
        runtime: 'bun',
      },
    ],
  });
  expect(await readFile(join(target, '.vscode/settings.json'), 'utf8')).toContain(
    '"bun.debugTerminal.enabled": true',
  );
  expect(await inspectManagedFiles(target, vscodeManagedFiles)).toContainEqual({
    relativePath: '.vscode/launch.json',
    state: 'current',
  });
  await syncManagedFiles(target, vscodeManagedFiles, { dryRun: false });
  expect(await readFile(launch, 'utf8')).toBe(contents);
  const customized = contents.replace('Debug Active File with Bun', 'Repository debugger');
  await writeFile(launch, customized);
  await syncManagedFiles(target, vscodeManagedFiles, { dryRun: false });
  expect(await readFile(launch, 'utf8')).toBe(customized);
});
