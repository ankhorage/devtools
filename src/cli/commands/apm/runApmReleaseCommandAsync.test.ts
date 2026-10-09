import { expect, test } from 'bun:test';

import { runApmReleaseCommandAsync } from './runApmReleaseCommandAsync.js';

test('rejects undeclared APM command arguments through its exit code', async () => {
  const stderr: string[] = [];
  const context = {
    cwd: process.cwd(),
    writeStdout: () => undefined,
    writeStderr: (text: string) => stderr.push(text),
  };

  for (const args of [
    ['--unknown'],
    ['--artifact'],
    ['--artifact', '--allow-owner-code'],
    ['one', 'two'],
  ]) {
    expect(await runApmReleaseCommandAsync('validate', args, context)).toEqual({ exitCode: 1 });
  }
  expect(stderr).toHaveLength(4);
});
