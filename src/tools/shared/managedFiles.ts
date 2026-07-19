import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type ManagedFileMode = 'create-only' | 'replace';
type ManagedFileRenderer = (targetDirectory: string) => Promise<string> | string;

export interface ManagedFileDefinition {
  readonly relativePath: string;
  readonly sourceUrl?: URL;
  readonly contents?: string;
  readonly render?: ManagedFileRenderer;
  readonly mode?: ManagedFileMode;
}

type ManagedFileState = 'current' | 'missing' | 'outdated';
type ManagedFileSyncAction = 'unchanged' | 'created' | 'updated' | 'would-create' | 'would-update';

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
      const targetPath = resolve(targetDirectory, definition.relativePath);

      try {
        const targetContents = await readFile(targetPath, 'utf8');
        if ((definition.mode ?? 'replace') === 'create-only') {
          return { relativePath: definition.relativePath, state: 'current' };
        }

        const canonicalContents = await readCanonicalContents(definition, targetDirectory);
        return {
          relativePath: definition.relativePath,
          state: targetContents === canonicalContents ? 'current' : 'outdated',
        };
      } catch (error) {
        if (isMissingFileError(error)) {
          return { relativePath: definition.relativePath, state: 'missing' };
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
    const result = await syncManagedFile(targetDirectory, status, definitionsByPath, options);
    results.push(result);
  }

  return results;
}

async function syncManagedFile(
  targetDirectory: string,
  status: ManagedFileStatus,
  definitionsByPath: ReadonlyMap<string, ManagedFileDefinition>,
  options: { readonly dryRun: boolean },
): Promise<ManagedFileSyncResult> {
  if (status.state === 'current') {
    return { relativePath: status.relativePath, action: 'unchanged' };
  }

  const definition = definitionsByPath.get(status.relativePath);
  if (definition === undefined) {
    throw new Error(`Missing managed file definition for ${status.relativePath}.`);
  }

  if (options.dryRun) {
    return {
      relativePath: status.relativePath,
      action: status.state === 'missing' ? 'would-create' : 'would-update',
    };
  }

  const targetPath = resolve(targetDirectory, definition.relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, await readCanonicalContents(definition, targetDirectory), 'utf8');
  return {
    relativePath: status.relativePath,
    action: status.state === 'missing' ? 'created' : 'updated',
  };
}

async function readCanonicalContents(
  definition: ManagedFileDefinition,
  targetDirectory: string,
): Promise<string> {
  assertSingleContentSource(definition);

  if (definition.sourceUrl !== undefined) {
    return await readFile(definition.sourceUrl, 'utf8');
  }
  if (definition.contents !== undefined) {
    return definition.contents;
  }
  if (definition.render !== undefined) {
    return await definition.render(targetDirectory);
  }

  throw new Error(`Managed file has no content source: ${definition.relativePath}`);
}

function assertSingleContentSource(definition: ManagedFileDefinition): void {
  const sourceCount = [definition.sourceUrl, definition.contents, definition.render].filter(
    (value) => value !== undefined,
  ).length;
  if (sourceCount !== 1) {
    throw new Error(
      `Managed file must define exactly one content source: ${definition.relativePath}`,
    );
  }
}

function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
