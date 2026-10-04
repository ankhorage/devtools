import { mkdtemp, rm } from 'node:fs/promises';

import { expect, test } from 'bun:test';

import { findDevtoolsCommandByPath } from './commands.js';
import { parseRepositoryArguments, runRepositoryCommand } from './runRepositoryCommand.js';

test('supports repository dry-run without materializing managed files', async () => {
  const target = await mkdtemp('/tmp/devtools-repository-dry-run-');
  const stdout: string[] = [];
  let dependencySyncs = 0;
  try {
    const command = findDevtoolsCommandByPath(['sync']);
    if (command?.kind !== 'repository') throw new Error('Expected repository sync command.');

    const result = await runRepositoryCommand(command, ['--dry-run'], {
      cwd: target,
      syncDependencies: () => {
        dependencySyncs += 1;
        return Promise.resolve({ relativePath: 'bun.lock', action: 'created' });
      },
      writeStdout: (text) => stdout.push(text),
      writeStderr: () => undefined,
    });

    expect(result.exitCode).toBe(0);
    expect(stdout.join('')).toContain('package.json would create');
    expect(stdout.join('')).toContain('bun.lock would create');
    expect(await Bun.file(`${target}/package.json`).exists()).toBe(false);
    expect(await Bun.file(`${target}/.github/workflows/ci.yml`).exists()).toBe(false);
    expect(dependencySyncs).toBe(0);
  } finally {
    await rm(target, { recursive: true, force: true });
  }
});

test('validates repository command arguments', () => {
  expect(() => parseRepositoryArguments(['--dry-run'], false)).toThrow(
    '--dry-run is only valid for sync commands.',
  );
  expect(() => parseRepositoryArguments(['one', 'two'], true)).toThrow(
    'Only one target path may be provided.',
  );
});
