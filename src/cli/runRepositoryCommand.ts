import { eslintManagedFiles } from '../tools/eslint/managed.js';
import { knipManagedFiles } from '../tools/knip/managed.js';
import {
  inspectPackageManifest,
  readCurrentDevtoolsVersion,
  syncPackageManifest,
} from '../tools/package/index.js';
import { syncBunDependencies } from '../tools/package/syncBunDependencies.js';
import { prettierManagedFiles } from '../tools/prettier/managed.js';
import {
  inspectManagedFiles,
  type ManagedFileDefinition,
  type ManagedFileStatus,
  type ManagedFileSyncResult,
  resolveManagedTargetDirectory,
  syncManagedFiles,
} from '../tools/shared/managedFiles.js';
import { vscodeManagedFiles } from '../tools/vscode/index.js';
import { workflowManagedFiles } from '../tools/workflows/index.js';
import type { DevtoolsRepositoryCommandDefinition } from './commands.js';

export interface DevtoolsRepositoryCommandContext {
  readonly cwd: string;
  readonly syncDependencies?: (targetDirectory: string) => Promise<ManagedFileSyncResult>;
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
  try {
    const parsed = parseRepositoryArguments(argv, command.operation === 'sync');
    const targetDirectory = await resolveManagedTargetDirectory(context.cwd, parsed.targetPath);
    const devtoolsVersion = readCurrentDevtoolsVersion();

    return command.operation === 'status'
      ? await runStatus(command.scope, targetDirectory, devtoolsVersion, context)
      : await runSync(command.scope, targetDirectory, devtoolsVersion, parsed.dryRun, context);
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

async function runStatus(
  scope: DevtoolsRepositoryCommandDefinition['scope'],
  targetDirectory: string,
  devtoolsVersion: string,
  context: DevtoolsRepositoryCommandContext,
): Promise<DevtoolsRepositoryCommandResult> {
  const statuses: ManagedFileStatus[] = [];
  if (scope === 'all' || scope === 'package') {
    statuses.push(await inspectPackageManifest(targetDirectory, devtoolsVersion));
  }
  statuses.push(...(await inspectManagedFiles(targetDirectory, getManagedFiles(scope))));

  writeStatusOutput(statuses, context);
  return { exitCode: statuses.some((status) => status.state !== 'current') ? 1 : 0 };
}

async function runSync(
  scope: DevtoolsRepositoryCommandDefinition['scope'],
  targetDirectory: string,
  devtoolsVersion: string,
  dryRun: boolean,
  context: DevtoolsRepositoryCommandContext,
): Promise<DevtoolsRepositoryCommandResult> {
  const results: ManagedFileSyncResult[] = [];
  if (scope === 'all' || scope === 'package') {
    const packageResult = await syncPackageManifest(targetDirectory, devtoolsVersion, { dryRun });
    results.push(packageResult);
    if (!dryRun && packageResult.action !== 'unchanged') {
      const syncDependencies = context.syncDependencies ?? syncBunDependencies;
      results.push(await syncDependencies(targetDirectory));
    }
  }
  results.push(...(await syncManagedFiles(targetDirectory, getManagedFiles(scope), { dryRun })));

  writeSyncOutput(results, context);
  return { exitCode: 0 };
}

function getManagedFiles(
  scope: DevtoolsRepositoryCommandDefinition['scope'],
): readonly ManagedFileDefinition[] {
  const definitionsByScope = {
    eslint: eslintManagedFiles,
    knip: knipManagedFiles,
    prettier: prettierManagedFiles,
    vscode: vscodeManagedFiles,
    workflows: workflowManagedFiles,
  } as const;

  if (scope === 'all') {
    return Object.values(definitionsByScope).flat();
  }
  if (scope === 'package') {
    return [];
  }
  return definitionsByScope[scope];
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
