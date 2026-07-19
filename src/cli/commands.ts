export type DevtoolsToolName = 'format' | 'knip' | 'lint';
type DevtoolsManagedScope =
  | 'all'
  | 'eslint'
  | 'knip'
  | 'package'
  | 'prettier'
  | 'vscode'
  | 'workflows';
type DevtoolsManagedOperation = 'status' | 'sync';

type DevtoolsCapability =
  | 'devtools.format'
  | 'devtools.knip'
  | 'devtools.lint'
  | 'devtools.status'
  | 'devtools.sync'
  | 'devtools.eslint.status'
  | 'devtools.eslint.sync'
  | 'devtools.knip.status'
  | 'devtools.knip.sync'
  | 'devtools.package.status'
  | 'devtools.package.sync'
  | 'devtools.prettier.status'
  | 'devtools.prettier.sync'
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
  readonly packageName: 'eslint' | 'knip' | 'prettier';
  readonly binName: 'eslint' | 'knip' | 'prettier';
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
  externalCommand('lint', 'devtools.lint', 'Run the shared ESLint toolchain.', 'eslint'),
  externalCommand('format', 'devtools.format', 'Run the shared Prettier toolchain.', 'prettier'),
  externalCommand('knip', 'devtools.knip', 'Run the shared Knip toolchain.', 'knip'),
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
  capability: Extract<DevtoolsCapability, 'devtools.format' | 'devtools.knip' | 'devtools.lint'>,
  summary: string,
  packageName: DevtoolsExternalCommandDefinition['packageName'],
): DevtoolsExternalCommandDefinition {
  return {
    kind: 'external',
    toolName,
    path: [toolName],
    capability,
    summary,
    packageName,
    binName: packageName,
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
