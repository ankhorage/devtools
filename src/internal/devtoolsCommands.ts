export type DevtoolsToolName = 'format' | 'knip' | 'lint';
export type ManagedConcern = 'all' | 'vscode' | 'workflows';

export interface BinaryDevtoolsCommandDefinition {
  readonly kind: 'binary';
  readonly path: readonly [DevtoolsToolName];
  readonly capability: 'devtools.format' | 'devtools.knip' | 'devtools.lint';
  readonly summary: string;
  readonly packageName: 'eslint' | 'knip' | 'prettier';
  readonly binName: 'eslint' | 'knip' | 'prettier';
}

export interface ManagedDevtoolsCommandDefinition {
  readonly kind: 'managed-files';
  readonly path: readonly ['sync' | 'status'] | readonly ['workflows' | 'vscode', 'sync' | 'status'];
  readonly capability:
    | 'devtools.sync'
    | 'devtools.status'
    | 'devtools.workflows.sync'
    | 'devtools.workflows.status'
    | 'devtools.vscode.sync'
    | 'devtools.vscode.status';
  readonly summary: string;
  readonly concern: ManagedConcern;
  readonly mode: 'sync' | 'status';
}

export type DevtoolsCommandDefinition =
  | BinaryDevtoolsCommandDefinition
  | ManagedDevtoolsCommandDefinition;

const DEVTOOLS_COMMANDS = [
  {
    kind: 'binary',
    path: ['lint'],
    capability: 'devtools.lint',
    summary: 'Run the shared ESLint toolchain.',
    packageName: 'eslint',
    binName: 'eslint',
  },
  {
    kind: 'binary',
    path: ['format'],
    capability: 'devtools.format',
    summary: 'Run the shared Prettier toolchain.',
    packageName: 'prettier',
    binName: 'prettier',
  },
  {
    kind: 'binary',
    path: ['knip'],
    capability: 'devtools.knip',
    summary: 'Run the shared Knip toolchain.',
    packageName: 'knip',
    binName: 'knip',
  },
  {
    kind: 'managed-files',
    path: ['sync'],
    capability: 'devtools.sync',
    summary: 'Synchronize all managed repository development files.',
    concern: 'all',
    mode: 'sync',
  },
  {
    kind: 'managed-files',
    path: ['status'],
    capability: 'devtools.status',
    summary: 'Report drift in all managed repository development files.',
    concern: 'all',
    mode: 'status',
  },
  {
    kind: 'managed-files',
    path: ['workflows', 'sync'],
    capability: 'devtools.workflows.sync',
    summary: 'Synchronize managed GitHub Actions workflows.',
    concern: 'workflows',
    mode: 'sync',
  },
  {
    kind: 'managed-files',
    path: ['workflows', 'status'],
    capability: 'devtools.workflows.status',
    summary: 'Report drift in managed GitHub Actions workflows.',
    concern: 'workflows',
    mode: 'status',
  },
  {
    kind: 'managed-files',
    path: ['vscode', 'sync'],
    capability: 'devtools.vscode.sync',
    summary: 'Synchronize managed VS Code workspace files.',
    concern: 'vscode',
    mode: 'sync',
  },
  {
    kind: 'managed-files',
    path: ['vscode', 'status'],
    capability: 'devtools.vscode.status',
    summary: 'Report drift in managed VS Code workspace files.',
    concern: 'vscode',
    mode: 'status',
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

export function getDevtoolsCommand(toolName: DevtoolsToolName): BinaryDevtoolsCommandDefinition {
  const command = DEVTOOLS_COMMANDS.find(
    (candidate): candidate is BinaryDevtoolsCommandDefinition =>
      candidate.kind === 'binary' && candidate.path[0] === toolName,
  );

  if (command === undefined) {
    throw new Error(`Unknown devtools command: ${toolName}`);
  }

  return command;
}
