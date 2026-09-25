#!/usr/bin/env node

import { runStructureGenerationCommandAsync } from '../runStructureGenerationCommandAsync.js';

const [operation, ...argv] = process.argv.slice(2);
if (operation !== 'build' && operation !== 'check') {
  console.error('Usage: ankhorage-structure <build|check> [directory]');
  process.exitCode = 1;
} else {
  const result = await runStructureGenerationCommandAsync(operation, argv, {
    cwd: process.cwd(),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
  });
  process.exitCode = result.exitCode;
}
