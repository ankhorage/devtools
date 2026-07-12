import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export type ManagedFileState = 'current' | 'missing' | 'outdated';
export type ManagedFileAction = 'created' | 'unchanged' | 'updated' | 'would-create' | 'would-update';

export interface ManagedFileDefinition {
  readonly targetPath: string;
  readonly sourceUrl: URL;
}

export interface ManagedFileStatus {
  readonly targetPath: string;
  readonly state: ManagedFileState;
}

export interface ManagedFileSyncResult {
  readonly targetPath: string;
  readonly action: ManagedFileAction;
}

export function inspectManagedFiles(
  targetRoot: string,
  files: readonly ManagedFileDefinition[],
): readonly ManagedFileStatus[] {
  assertDirectory(targetRoot);

  return files.map((file) => {
    const targetPath = resolve(targetRoot, file.targetPath);
    if (!existsSync(targetPath)) {
      return { targetPath: file.targetPath, state: 'missing' };
    }

    const current = readFileSync(targetPath, 'utf8');
    const canonical = readFileSync(file.sourceUrl, 'utf8');
    return {
      targetPath: file.targetPath,
      state: current === canonical ? 'current' : 'outdated',
    };
  });
}

export function syncManagedFiles(
  targetRoot: string,
  files: readonly ManagedFileDefinition[],
  options: { readonly dryRun?: boolean } = {},
): readonly ManagedFileSyncResult[] {
  const statuses = inspectManagedFiles(targetRoot, files);

  return statuses.map((status, index) => {
    const definition = files[index];
    if (definition === undefined) {
      throw new Error(`Missing managed file definition for ${status.targetPath}.`);
    }

    if (status.state === 'current') {
      return { targetPath: status.targetPath, action: 'unchanged' };
    }

    if (options.dryRun === true) {
      return {
        targetPath: status.targetPath,
        action: status.state === 'missing' ? 'would-create' : 'would-update',
      };
    }

    const targetPath = resolve(targetRoot, definition.targetPath);
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, readFileSync(definition.sourceUrl, 'utf8'), 'utf8');

    return {
      targetPath: status.targetPath,
      action: status.state === 'missing' ? 'created' : 'updated',
    };
  });
}

function assertDirectory(targetRoot: string): void {
  if (!existsSync(targetRoot)) {
    throw new Error(`Target path does not exist: ${targetRoot}`);
  }
  if (!statSync(targetRoot).isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetRoot}`);
  }
}
