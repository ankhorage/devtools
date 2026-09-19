/***
 * Run and synchronize the shared development toolchain through the Ankh CLI.
 *
 * `ankh devtools changeset`, `ankh devtools lint`, `ankh devtools format`, and
 * `ankh devtools knip` execute the bundled Changesets, ESLint, Prettier, and Knip versions.
 * Repository synchronization is available through
 * `ankh devtools sync` and `ankh devtools status`, with focused `agents`, `skills`, `eslint`,
 * `prettier`, `knip`, `package`, `workflows`, and `vscode` sync/status subcommands.
 * Owner packages can opt into deterministic structural metadata with
 * `ankh devtools structure build` and verify committed evidence with `ankh devtools structure check`.
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
 * APM owner releases opt in through `ankh.apm`. `ankh devtools apm sync .` binds a valid
 * descriptor to the selected Changesets version. `ankh devtools apm validate .` checks a
 * script-free tarball; `--allow-owner-code` explicitly permits the isolated executable probe.
 * `--artifact <path>` retains the exact accepted tarball and `--expected-integrity <SRI>`
 * rejects changed bytes. Owners provide `test:apm` for source-to-target and recovery fixtures.
 * CI runs that owner suite and the packed check. Release rebuilds after versioning, validates,
 * then publishes the retained archive with scripts disabled through the existing release job.
 * Packages without metadata keep their existing Changesets publish path unchanged.
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
