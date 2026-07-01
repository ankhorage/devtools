export type DevtoolsToolName = 'format' | 'knip' | 'lint';

export interface DevtoolsCommandDefinition {
  path: readonly [DevtoolsToolName];
  capability: 'devtools.format' | 'devtools.knip' | 'devtools.lint';
  summary: string;
  packageName: 'eslint' | 'knip' | 'prettier';
  binName: 'eslint' | 'knip' | 'prettier';
}

const DEVTOOLS_COMMANDS = [
  {
    path: ['lint'],
    capability: 'devtools.lint',
    summary: 'Run the shared ESLint toolchain.',
    packageName: 'eslint',
    binName: 'eslint',
  },
  {
    path: ['format'],
    capability: 'devtools.format',
    summary: 'Run the shared Prettier toolchain.',
    packageName: 'prettier',
    binName: 'prettier',
  },
  {
    path: ['knip'],
    capability: 'devtools.knip',
    summary: 'Run the shared Knip toolchain.',
    packageName: 'knip',
    binName: 'knip',
  },
] as const satisfies readonly DevtoolsCommandDefinition[];

export function getDevtoolsCommands(): readonly DevtoolsCommandDefinition[] {
  return DEVTOOLS_COMMANDS;
}

export function findDevtoolsCommandByPath(
  path: readonly string[],
): DevtoolsCommandDefinition | null {
  if (path.length !== 1) {
    return null;
  }

  return DEVTOOLS_COMMANDS.find((command) => command.path[0] === path[0]) ?? null;
}

export function getDevtoolsCommand(toolName: DevtoolsToolName): DevtoolsCommandDefinition {
  const command = DEVTOOLS_COMMANDS.find((candidate) => candidate.path[0] === toolName);

  if (command === undefined) {
    throw new Error(`Unknown devtools command: ${toolName}`);
  }

  return command;
}
