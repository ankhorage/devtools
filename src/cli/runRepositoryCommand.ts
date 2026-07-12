import {
  inspectManagedFiles,
  resolveManagedTargetDirectory,
  syncManagedFiles,
  type ManagedFileDefinition,
  type ManagedFileStatus,
  type ManagedFileSyncResult,
} from '../tools/shared/managedFiles.js';
import { vscodeManagedFiles } from '../tools/vscode/index.js';
import { workflowManagedFiles } from '../tools/workflows/index.js';
import type { DevtoolsRepositoryCommandDefinition } from './commands.js';

export interface DevtoolsRepositoryCommandContext {
  readonly cwd: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export interface DevtoolsRepositoryCommandResult {
  readonly exitCode: number;
}

interface ParsedRepositoryArguments {
  readonly dryRun: boolean;
  readonly targetPath: string | undefined;
}

export async function runRepositoryCommand(
  command: DevtoolsRepositoryCommandDefinition,
  argv: readonly string[],
  context: DevtoolsRepositoryCommandContext,
): Promise<DevtoolsRepositoryCommandResult> {
  let parsedArguments: ParsedRepositoryArguments;

  try {
    parsedArguments = parseRepositoryArguments(argv, command.operation === 'sync');
  } catch (error) {
    context.writeStderr(`${getErrorMessage(error)}\n`);
    return { exitCode: 1 };
  }

  try {
    const targetDirectory = await resolveManagedTargetDirectory(
      context.cwd,
      parsedArguments.targetPath,
    );
    const definitions = getManagedFiles(command.scope);

    if (command.operation === 'status') {
      const statuses = await inspectManagedFiles(targetDirectory, definitions);
      writeStatusOutput(statuses, context);
      return {
        exitCode: statuses.some((status) => status.state !== 'current') ? 1 : 0,
      };
    }

    const results = await syncManagedFiles(targetDirectory, definitions, {
      dryRun: parsedArguments.dryRun,
    });
    writeSyncOutput(results, context);
    return { exitCode: 0 };
  } catch (error) {
    context.writeStderr(`${getErrorMessage(error)}\n`);
    return { exitCode: 1 };
  }
}

export function parseRepositoryArguments(
  argv: readonly string[],
  allowDryRun: boolean,
): ParsedRepositoryArguments {
  let dryRun = false;
  let targetPath: string | undefined;

  for (const argument of argv) {
    if (argument === '--dry-run') {
      if (!allowDryRun) {
        throw new Error('--dry-run is only valid for sync commands.');
      }
      dryRun = true;
      continue;
    }

    if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    }

    if (targetPath !== undefined) {
      throw new Error('Only one target path may be provided.');
    }

    targetPath = argument;
  }

  return { dryRun, targetPath };
}

function getManagedFiles(
  scope: DevtoolsRepositoryCommandDefinition['scope'],
): readonly ManagedFileDefinition[] {
  if (scope === 'workflows') {
    return workflowManagedFiles;
  }

  if (scope === 'vscode') {
    return vscodeManagedFiles;
  }

  return [...workflowManagedFiles, ...vscodeManagedFiles];
}

function writeStatusOutput(
  statuses: readonly ManagedFileStatus[],
  context: DevtoolsRepositoryCommandContext,
): void {
  for (const status of statuses) {
    if (status.state === 'current') {
      context.writeStdout(`✓ ${status.relativePath}\n`);
    } else if (status.state === 'missing') {
      context.writeStdout(`+ ${status.relativePath} missing\n`);
    } else {
      context.writeStdout(`✗ ${status.relativePath} outdated\n`);
    }
  }
}

function writeSyncOutput(
  results: readonly ManagedFileSyncResult[],
  context: DevtoolsRepositoryCommandContext,
): void {
  for (const result of results) {
    const prefix = getActionPrefix(result.action);
    context.writeStdout(`${prefix} ${result.relativePath} ${formatAction(result.action)}\n`);
  }
}

function getActionPrefix(action: ManagedFileSyncResult['action']): string {
  if (action === 'unchanged') {
    return '✓';
  }

  if (action === 'created' || action === 'would-create') {
    return '+';
  }

  return '↻';
}

function formatAction(action: ManagedFileSyncResult['action']): string {
  switch (action) {
    case 'created':
      return 'created';
    case 'updated':
      return 'updated';
    case 'unchanged':
      return 'unchanged';
    case 'would-create':
      return 'would create';
    case 'would-update':
      return 'would update';
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
