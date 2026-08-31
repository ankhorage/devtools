/***
 * Run and synchronize the shared development toolchain through the Ankh CLI.
 *
 * `ankh devtools changeset`, `ankh devtools lint`, `ankh devtools format`, and
 * `ankh devtools knip` execute the bundled Changesets, ESLint, Prettier, and Knip versions.
 * Repository synchronization is available through
 * `ankh devtools sync` and `ankh devtools status`, with focused `agents`, `skills`, `eslint`,
 * `prettier`, `knip`, `package`, `workflows`, and `vscode` sync/status subcommands.
 *
 * Sync commands accept an optional target directory and `--dry-run`. Aggregate sync is
 * deterministic and idempotent: canonical managed files and skill trees are created or updated,
 * unrelated repository-local skills and create-only local extension files remain repository-owned,
 * and package metadata is merge-updated without replacing unrelated fields.
 *
 * Fresh repositories can bootstrap the standard setup with `ankh devtools sync .` after adding
 * `@ankhorage/devtools`. Existing ESLint configuration is preserved during first migration as a
 * local extension before the canonical auto-detecting wrapper is installed.
 *
 * @readme
 */
import { readFileSync } from 'node:fs';

import type { AnkhRuntimeCommandProvider } from '@ankhorage/ankh';

import { getDevtoolsCommands } from './commands.js';
import { runProviderCommand } from './runProviderCommand.js';

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
      return await runProviderCommand(command, request.argv, request.context);
    },
  })),
} satisfies AnkhRuntimeCommandProvider;

export default provider;

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
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
