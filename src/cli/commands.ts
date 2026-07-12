export type DevtoolsToolName = 'format' | 'knip' | 'lint';
export type DevtoolsManagedScope = 'all' | 'vscode' | 'workflows';
export type DevtoolsManagedOperation = 'status' | 'sync';

export type DevtoolsCapability =
  | 'devtools.format'
  | 'devtools.knip'
  | 'devtools.lint'
  | 'devtools.status'
  | 'devtools.sync'
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
  {
    kind: 'external',
    toolName: 'lint',
    path: ['lint'],
    capability: 'devtools.lint',
    summary: 'Run the shared ESLint toolchain.',
    packageName: 'eslint',
    binName: 'eslint',
  },
  {
    kind: 'external',
    toolName: 'format',
    path: ['format'],
    capability: 'devtools.format',
    summary: 'Run the shared Prettier toolchain.',
    packageName: 'prettier',
    binName: 'prettier',
  },
  {
    kind: 'external',
    toolName: 'knip',
    path: ['knip'],
    capability: 'devtools.knip',
    summary: 'Run the shared Knip toolchain.',
    packageName: 'knip',
    binName: 'knip',
  },
  {
    kind: 'repository',
    path: ['sync'],
    capability: 'devtools.sync',
    summary: 'Synchronize all centrally managed repository files.',
    scope: 'all',
    operation: 'sync',
  },
  {
    kind: 'repository',
    path: ['status'],
    capability: 'devtools.status',
    summary: 'Report drift for all centrally managed repository files.',
    scope: 'all',
    operation: 'status',
  },
  {
    kind: 'repository',
    path: ['workflows', 'sync'],
    capability: 'devtools.workflows.sync',
    summary: 'Synchronize the canonical GitHub Actions workflows.',
    scope: 'workflows',
    operation: 'sync',
  },
  {
    kind: 'repository',
    path: ['workflows', 'status'],
    capability: 'devtools.workflows.status',
    summary: 'Report drift for the canonical GitHub Actions workflows.',
    scope: 'workflows',
    operation: 'status',
  },
  {
    kind: 'repository',
    path: ['vscode', 'sync'],
    capability: 'devtools.vscode.sync',
    summary: 'Synchronize the canonical VS Code workspace configuration.',
    scope: 'vscode',
    operation: 'sync',
  },
  {
    kind: 'repository',
    path: ['vscode', 'status'],
    capability: 'devtools.vscode.status',
    summary: 'Report drift for the canonical VS Code workspace configuration.',
    scope: 'vscode',
    operation: 'status',
  },
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
