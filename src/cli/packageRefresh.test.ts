import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { syncPackageManifest } from '../tools/package/index.js';
import { findDevtoolsCommandByPath } from './commands.js';
import { runRepositoryCommand } from './runRepositoryCommand.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('keeps a fresh package status current after a compatible Devtools patch refresh', async () => {
  const target = await mkdtemp('/tmp/devtools-package-refresh-');
  temporaryDirectories.push(target);
  await writeFile(join(target, 'package.json'), '{"name":"fixture","type":"module"}\n');
  await syncPackageManifest(target, '2.3.13', { dryRun: false });
  const beforeRefresh = await readFile(join(target, 'package.json'), 'utf8');
  const sync = getRepositoryCommand(['package', 'sync']);
  const status = getRepositoryCommand(['package', 'status']);

  expect((await runRepositoryCommand(sync, [], createContext(target))).exitCode).toBe(0);
  expect(await readFile(join(target, 'package.json'), 'utf8')).toBe(beforeRefresh);
  expect((await runRepositoryCommand(status, [], createContext(target))).exitCode).toBe(0);
});

/*** Resolve one repository command through the public command registry. */
function getRepositoryCommand(path: readonly string[]) {
  const command = findDevtoolsCommandByPath(path);
  if (command?.kind !== 'repository')
    throw new Error(`Expected repository command: ${path.join(' ')}`);
  return command;
}

/*** Build a fresh command context with an idempotent dependency-refresh boundary. */
function createContext(target: string) {
  return {
    cwd: target,
    syncDependencies: () =>
      Promise.resolve({ relativePath: 'bun.lock', action: 'unchanged' as const }),
    writeStderr: () => undefined,
    writeStdout: () => undefined,
  };
}
