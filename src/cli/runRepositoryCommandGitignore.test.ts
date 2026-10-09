import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { findDevtoolsCommandByPath } from './commands.js';
import { runRepositoryCommand } from './runRepositoryCommand.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('aggregate repository sync applies the documentation gitignore policy', async () => {
  const target = await mkdtemp('/tmp/devtools-repository-command-gitignore-');
  temporaryDirectories.push(target);
  await writeFile(join(target, 'package.json'), '{"name":"fixture","type":"module"}\n');
  await writeFile(join(target, '.gitignore'), 'dist/\ndocs/\nparadox/\ncustom/\n');
  const command = findDevtoolsCommandByPath(['sync']);
  if (command?.kind !== 'repository')
    throw new Error('Expected aggregate repository sync command.');

  const stdout: string[] = [];
  const stderr: string[] = [];
  expect(
    (
      await runRepositoryCommand(command, [], {
        cwd: target,
        syncDependencies: () =>
          Promise.resolve({ relativePath: 'bun.lock', action: 'unchanged' as const }),
        writeStdout: (text) => stdout.push(text),
        writeStderr: (text) => stderr.push(text),
      })
    ).exitCode,
  ).toBe(0);
  expect(await readFile(join(target, '.gitignore'), 'utf8')).toBe('dist/\ncustom/\n');
  expect(stdout.join('')).toContain('.gitignore updated');
  expect(stderr).toEqual([]);
});
