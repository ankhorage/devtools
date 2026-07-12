import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export interface ManagedFileDefinition {
  readonly relativePath: string;
  readonly sourceUrl: URL;
}

export type ManagedFileState = 'current' | 'missing' | 'outdated';
export type ManagedFileSyncAction =
  | 'unchanged'
  | 'created'
  | 'updated'
  | 'would-create'
  | 'would-update';

export interface ManagedFileStatus {
  readonly relativePath: string;
  readonly state: ManagedFileState;
}

export interface ManagedFileSyncResult {
  readonly relativePath: string;
  readonly action: ManagedFileSyncAction;
}

export async function resolveManagedTargetDirectory(
  cwd: string,
  requestedPath: string | undefined,
): Promise<string> {
  const targetDirectory = resolve(cwd, requestedPath ?? '.');

  let targetStats;
  try {
    targetStats = await stat(targetDirectory);
  } catch (error) {
    throw new Error(`Target directory does not exist: ${targetDirectory}`, { cause: error });
  }

  if (!targetStats.isDirectory()) {
    throw new Error(`Target path is not a directory: ${targetDirectory}`);
  }

  return targetDirectory;
}

export async function inspectManagedFiles(
  targetDirectory: string,
  definitions: readonly ManagedFileDefinition[],
): Promise<readonly ManagedFileStatus[]> {
  return await Promise.all(
    definitions.map(async (definition): Promise<ManagedFileStatus> => {
      const canonicalContents = await readCanonicalContents(definition);
      const targetPath = resolve(targetDirectory, definition.relativePath);

      try {
        const targetContents = await readFile(targetPath, 'utf8');
        return {
          relativePath: definition.relativePath,
          state: targetContents === canonicalContents ? 'current' : 'outdated',
        };
      } catch (error) {
        if (isMissingFileError(error)) {
          return {
            relativePath: definition.relativePath,
            state: 'missing',
          };
        }

        throw new Error(`Failed to inspect managed file: ${targetPath}`, { cause: error });
      }
    }),
  );
}

export async function syncManagedFiles(
  targetDirectory: string,
  definitions: readonly ManagedFileDefinition[],
  options: { readonly dryRun: boolean },
): Promise<readonly ManagedFileSyncResult[]> {
  const statuses = await inspectManagedFiles(targetDirectory, definitions);
  const definitionsByPath = new Map(
    definitions.map((definition) => [definition.relativePath, definition] as const),
  );
  const results: ManagedFileSyncResult[] = [];

  for (const status of statuses) {
    if (status.state === 'current') {
      results.push({ relativePath: status.relativePath, action: 'unchanged' });
      continue;
    }

    const definition = definitionsByPath.get(status.relativePath);
    if (definition === undefined) {
      throw new Error(`Missing managed file definition for ${status.relativePath}.`);
    }

    if (options.dryRun) {
      results.push({
        relativePath: status.relativePath,
        action: status.state === 'missing' ? 'would-create' : 'would-update',
      });
      continue;
    }

    const targetPath = resolve(targetDirectory, definition.relativePath);
    await mkdir(dirname(targetPath), { recursive: true });
    await writeFile(targetPath, await readCanonicalContents(definition), 'utf8');
    results.push({
      relativePath: status.relativePath,
      action: status.state === 'missing' ? 'created' : 'updated',
    });
  }

  return results;
}

async function readCanonicalContents(definition: ManagedFileDefinition): Promise<string> {
  try {
    return await readFile(definition.sourceUrl, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read canonical managed file: ${definition.relativePath}`, {
      cause: error,
    });
  }
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
