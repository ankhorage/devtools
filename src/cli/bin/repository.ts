#!/usr/bin/env node

import { findDevtoolsCommandByPath } from '../commands.js';
import { runRepositoryCommand } from '../runRepositoryCommand.js';

const [scope, operation, ...argv] = process.argv.slice(2);
const command = findDevtoolsCommandByPath([scope, operation]);

if (command?.kind !== 'repository') {
  console.error('Usage: ankhorage-repository <scope> <sync|status> [directory] [--dry-run]');
  process.exitCode = 1;
} else {
  const result = await runRepositoryCommand(command, argv, {
    cwd: process.cwd(),
    writeStdout: (text) => process.stdout.write(text),
    writeStderr: (text) => process.stderr.write(text),
  });
  process.exitCode = result.exitCode;
}
