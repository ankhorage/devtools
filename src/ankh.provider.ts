import { readFileSync } from 'node:fs';

import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import { getDevtoolsCommands } from './internal/devtoolsCommands.js';
import { runDevtoolsCommand } from './internal/runDevtoolsCommand.js';

const packageVersion = readPackageVersion();
const commands = getDevtoolsCommands();

const provider = {
  id: '@ankhorage/devtools',
  category: 'devtools',
  version: packageVersion,
  capabilities: commands.map((command) => command.capability),
  commands: commands.map((command) => ({
    path: [...command.path],
    capability: command.capability,
    summary: command.summary,
  })),
  handlers: commands.map((command) => ({
    path: [...command.path],
    handler: async (request) => {
      const result = await runDevtoolsCommand(command, request.argv);
      return { exitCode: result.exitCode };
    },
  })),
} satisfies AnkhRuntimeCommandProvider;

export default provider;

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  ) as unknown;

  if (!isRecord(packageJson) || !isNonEmptyString(packageJson.version)) {
    throw new Error('package.json must define a non-empty version string.');
  }

  return packageJson.version;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
