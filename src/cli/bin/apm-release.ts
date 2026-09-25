#!/usr/bin/env node

import { runApmReleaseCommandAsync } from '../runApmReleaseCommandAsync.js';

const [operation, ...argv] = process.argv.slice(2);
if (operation !== 'sync' && operation !== 'validate') {
  console.error(
    'Usage: ankhorage-apm-release <sync|validate> [directory] [--allow-owner-code] [--artifact path] [--expected-integrity value]',
  );
  process.exitCode = 1;
} else {
  const result = await runApmReleaseCommandAsync(operation, argv, {
    cwd: process.cwd(),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
  });
  process.exitCode = result.exitCode;
}
