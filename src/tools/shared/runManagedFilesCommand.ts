import { resolve } from 'node:path';

import type { ManagedFileDefinition } from './managedFiles.js';
import { inspectManagedFiles, syncManagedFiles } from './managedFiles.js';

export interface ManagedFilesCommandContext {
  readonly cwd: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export async function runManagedFilesCommand(
  mode: 'status' | 'sync',
  files: readonly ManagedFileDefinition[],
  argv: readonly string[],
  context: ManagedFilesCommandContext,
): Promise<{ readonly exitCode: number }> {
  const dryRun = argv.includes('--dry-run');
  const positional = argv.filter((argument) => argument !== '--dry-run');
  const targetRoot = resolve(context.cwd, positional[0] ?? '.');

  if (positional.length > 1 || (mode === 'status' && dryRun)) {
    context.writeStderr('Usage error: provide at most one target path; --dry-run is sync-only.\n');
    return { exitCode: 2 };
  }

  try {
    if (mode === 'status') {
      const statuses = inspectManagedFiles(targetRoot, files);
      for (const status of statuses) {
        const marker = status.state === 'current' ? '✓' : status.state === 'missing' ? '+' : '✗';
        context.writeStdout(`${marker} ${status.targetPath} ${status.state}\n`);
      }
      return { exitCode: statuses.every((status) => status.state === 'current') ? 0 : 1 };
    }

    const results = syncManagedFiles(targetRoot, files, { dryRun });
    for (const result of results) {
      context.writeStdout(`${result.action} ${result.targetPath}\n`);
    }
    return { exitCode: 0 };
  } catch (error) {
    context.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}
