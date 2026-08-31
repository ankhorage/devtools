export type DevtoolsToolName = 'changeset' | 'format' | 'knip' | 'lint';
type DevtoolsManagedScope =
  | 'agents'
  | 'all'
  | 'eslint'
  | 'knip'
  | 'package'
  | 'prettier'
  | 'skills'
  | 'vscode'
  | 'workflows';
type DevtoolsManagedOperation = 'status' | 'sync';

type DevtoolsCapability =
  | 'devtools.changeset'
  | 'devtools.format'
  | 'devtools.knip'
  | 'devtools.lint'
  | 'devtools.status'
  | 'devtools.sync'
  | 'devtools.agents.status'
  | 'devtools.agents.sync'
  | 'devtools.eslint.status'
  | 'devtools.eslint.sync'
  | 'devtools.knip.status'
  | 'devtools.knip.sync'
  | 'devtools.package.status'
  | 'devtools.package.sync'
  | 'devtools.prettier.status'
  | 'devtools.prettier.sync'
  | 'devtools.skills.status'
  | 'devtools.skills.sync'
  | 'devtools.vscode.status'
  | 'devtools.vscode.sync'
  | 'devtools.workflows.status'
  | 'devtools.workflows.sync';

interface DevtoolsCommandBase {
  readonly path: readonly [string, ...string[]];
  readonly capability: DevtoolsCapability;
  readonly summary: string;
}

export interface DevtoolsExternalCommandDefinition extends DevtoolsCommandBase {
  readonly kind: 'external';
  readonly toolName: DevtoolsToolName;
  readonly packageName: '@changesets/cli' | 'eslint' | 'knip' | 'prettier';
  readonly binName: 'changeset' | 'eslint' | 'knip' | 'prettier';
}

export interface DevtoolsRepositoryCommandDefinition extends DevtoolsCommandBase {
  readonly kind: 'repository';
  readonly scope: DevtoolsManagedScope;
  readonly operation: DevtoolsManagedOperation;
}

export type DevtoolsCommandDefinition =
  | DevtoolsExternalCommandDefinition
  | DevtoolsRepositoryCommandDefinition;

const DEVTOOLS_COMMANDS = [
  externalCommand(
    'changeset',
    'devtools.changeset',
    'Run the shared Changesets toolchain.',
    '@changesets/cli',
    'changeset',
  ),
  externalCommand('lint', 'devtools.lint', 'Run the shared ESLint toolchain.', 'eslint', 'eslint'),
  externalCommand(
    'format',
    'devtools.format',
    'Run the shared Prettier toolchain.',
    'prettier',
    'prettier',
  ),
  externalCommand('knip', 'devtools.knip', 'Run the shared Knip toolchain.', 'knip', 'knip'),
  repositoryCommand(
    ['sync'],
    'devtools.sync',
    'Synchronize all managed repository setup.',
    'all',
    'sync',
  ),
  repositoryCommand(
    ['status'],
    'devtools.status',
    'Report drift for all managed repository setup.',
    'all',
    'status',
  ),
  repositoryCommand(
    ['agents', 'sync'],
    'devtools.agents.sync',
    'Synchronize the canonical repository agent instructions.',
    'agents',
    'sync',
  ),
  repositoryCommand(
    ['agents', 'status'],
    'devtools.agents.status',
    'Report drift for the canonical repository agent instructions.',
    'agents',
    'status',
  ),
  repositoryCommand(
    ['skills', 'sync'],
    'devtools.skills.sync',
    'Synchronize canonical repository-local agent skills.',
    'skills',
    'sync',
  ),
  repositoryCommand(
    ['skills', 'status'],
    'devtools.skills.status',
    'Report drift for canonical repository-local agent skills.',
    'skills',
    'status',
  ),
  repositoryCommand(
    ['eslint', 'sync'],
    'devtools.eslint.sync',
    'Synchronize the shared ESLint setup.',
    'eslint',
    'sync',
  ),
  repositoryCommand(
    ['eslint', 'status'],
    'devtools.eslint.status',
    'Report drift for the shared ESLint setup.',
    'eslint',
    'status',
  ),
  repositoryCommand(
    ['prettier', 'sync'],
    'devtools.prettier.sync',
    'Synchronize the shared Prettier setup.',
    'prettier',
    'sync',
  ),
  repositoryCommand(
    ['prettier', 'status'],
    'devtools.prettier.status',
    'Report drift for the shared Prettier setup.',
    'prettier',
    'status',
  ),
  repositoryCommand(
    ['knip', 'sync'],
    'devtools.knip.sync',
    'Synchronize the shared Knip setup.',
    'knip',
    'sync',
  ),
  repositoryCommand(
    ['knip', 'status'],
    'devtools.knip.status',
    'Report drift for the shared Knip setup.',
    'knip',
    'status',
  ),
  repositoryCommand(
    ['package', 'sync'],
    'devtools.package.sync',
    'Synchronize the shared package.json contract.',
    'package',
    'sync',
  ),
  repositoryCommand(
    ['package', 'status'],
    'devtools.package.status',
    'Report drift for the shared package.json contract.',
    'package',
    'status',
  ),
  repositoryCommand(
    ['workflows', 'sync'],
    'devtools.workflows.sync',
    'Synchronize the canonical GitHub Actions workflows.',
    'workflows',
    'sync',
  ),
  repositoryCommand(
    ['workflows', 'status'],
    'devtools.workflows.status',
    'Report drift for the canonical GitHub Actions workflows.',
    'workflows',
    'status',
  ),
  repositoryCommand(
    ['vscode', 'sync'],
    'devtools.vscode.sync',
    'Synchronize the canonical VS Code workspace configuration.',
    'vscode',
    'sync',
  ),
  repositoryCommand(
    ['vscode', 'status'],
    'devtools.vscode.status',
    'Report drift for the canonical VS Code workspace configuration.',
    'vscode',
    'status',
  ),
] as const satisfies readonly DevtoolsCommandDefinition[];

export function getDevtoolsCommands(): readonly DevtoolsCommandDefinition[] {
  return DEVTOOLS_COMMANDS;
}

export function findDevtoolsCommandByPath(
  path: readonly string[],
): DevtoolsCommandDefinition | null {
  return (
    DEVTOOLS_COMMANDS.find(
      (command) =>
        command.path.length === path.length &&
        command.path.every((segment, index) => segment === path[index]),
    ) ?? null
  );
}

export function getDevtoolsToolCommand(
  toolName: DevtoolsToolName,
): DevtoolsExternalCommandDefinition {
  for (const command of DEVTOOLS_COMMANDS) {
    if (command.kind === 'external' && command.toolName === toolName) {
      return command;
    }
  }

  throw new Error(`Unknown devtools tool command: ${toolName}`);
}

function externalCommand(
  toolName: DevtoolsToolName,
  capability: Extract<
    DevtoolsCapability,
    'devtools.changeset' | 'devtools.format' | 'devtools.knip' | 'devtools.lint'
  >,
  summary: string,
  packageName: DevtoolsExternalCommandDefinition['packageName'],
  binName: DevtoolsExternalCommandDefinition['binName'],
): DevtoolsExternalCommandDefinition {
  return {
    kind: 'external',
    toolName,
    path: [toolName],
    capability,
    summary,
    packageName,
    binName,
  };
}

function repositoryCommand(
  path: DevtoolsRepositoryCommandDefinition['path'],
  capability: DevtoolsCapability,
  summary: string,
  scope: DevtoolsManagedScope,
  operation: DevtoolsManagedOperation,
): DevtoolsRepositoryCommandDefinition {
  return { kind: 'repository', path, capability, summary, scope, operation };
}
