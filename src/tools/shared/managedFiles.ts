import { lstat, mkdir, readFile, readlink, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

type ManagedFileMode = 'create-only' | 'replace';
type ManagedFileRenderer = (targetDirectory: string) => Promise<string> | string;

export interface ManagedFileDefinition {
  readonly relativePath: string;
  readonly sourceUrl?: URL;
  readonly contents?: string;
  readonly render?: ManagedFileRenderer;
  readonly symlinkTarget?: string;
  readonly mode?: ManagedFileMode;
  readonly isApplicable?: (targetDirectory: string) => Promise<boolean> | boolean;
}

type ManagedFileState = 'current' | 'missing' | 'obsolete' | 'outdated';
export type ManagedFileSyncAction =
  | 'unchanged'
  | 'created'
  | 'removed'
  | 'updated'
  | 'would-create'
  | 'would-remove'
  | 'would-update';

export interface ManagedFileStatus {
  readonly relativePath: string;
  readonly state: ManagedFileState;
}

export interface ManagedFileSyncResult {
  readonly relativePath: string;
  readonly action: ManagedFileSyncAction;
}

/*** Resolve and validate the repository directory targeted by a managed-files operation. */
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

/*** Inspect managed files and symbolic links without mutating repository state. */
export async function inspectManagedFiles(
  targetDirectory: string,
  definitions: readonly ManagedFileDefinition[],
): Promise<readonly ManagedFileStatus[]> {
  const statuses = await Promise.all(
    definitions.map((definition) => inspectManagedFileAsync(targetDirectory, definition)),
  );
  return statuses.filter((status): status is ManagedFileStatus => status !== undefined);
}

/*** Synchronize managed files and symbolic links to their canonical definitions. */
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
    results.push(await syncManagedFileAsync(targetDirectory, status, definitionsByPath, options));
  }

  return results;
}

/*** Inspect one managed artifact against its file or symbolic-link definition. */
async function inspectManagedFileAsync(
  targetDirectory: string,
  definition: ManagedFileDefinition,
): Promise<ManagedFileStatus | undefined> {
  assertSingleContentSource(definition);
  const targetPath = resolve(targetDirectory, definition.relativePath);
  const isApplicable = await (definition.isApplicable?.(targetDirectory) ?? true);

  try {
    const targetStats = await lstat(targetPath);
    if (!isApplicable) {
      return { relativePath: definition.relativePath, state: 'obsolete' };
    }
    if ((definition.mode ?? 'replace') === 'create-only') {
      return { relativePath: definition.relativePath, state: 'current' };
    }

    const current =
      definition.symlinkTarget === undefined
        ? await isCurrentFileAsync(
            targetPath,
            targetStats.isSymbolicLink(),
            definition,
            targetDirectory,
          )
        : await isCurrentSymlinkAsync(
            targetPath,
            targetStats.isSymbolicLink(),
            definition.symlinkTarget,
          );
    return {
      relativePath: definition.relativePath,
      state: current ? 'current' : 'outdated',
    };
  } catch (error) {
    if (isMissingFileError(error)) {
      return isApplicable ? { relativePath: definition.relativePath, state: 'missing' } : undefined;
    }
    throw new Error(`Failed to inspect managed file: ${targetPath}`, { cause: error });
  }
}

/*** Compare one regular managed file with its canonical rendered contents. */
async function isCurrentFileAsync(
  targetPath: string,
  isSymbolicLink: boolean,
  definition: ManagedFileDefinition,
  targetDirectory: string,
): Promise<boolean> {
  if (isSymbolicLink) return false;
  return (
    (await readFile(targetPath, 'utf8')) ===
    (await readCanonicalContents(definition, targetDirectory))
  );
}

/*** Compare one managed symbolic link with its canonical relative target. */
async function isCurrentSymlinkAsync(
  targetPath: string,
  isSymbolicLink: boolean,
  symlinkTarget: string,
): Promise<boolean> {
  return isSymbolicLink && (await readlink(targetPath)) === symlinkTarget;
}

/*** Apply one managed artifact status to the target repository. */
async function syncManagedFileAsync(
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

  if (status.state === 'obsolete') {
    if (!options.dryRun) {
      await rm(resolve(targetDirectory, definition.relativePath), { force: true, recursive: true });
    }
    return {
      relativePath: status.relativePath,
      action: options.dryRun ? 'would-remove' : 'removed',
    };
  }

  if (options.dryRun) {
    return {
      relativePath: status.relativePath,
      action: status.state === 'missing' ? 'would-create' : 'would-update',
    };
  }

  const targetPath = resolve(targetDirectory, definition.relativePath);
  await mkdir(dirname(targetPath), { recursive: true });
  if (status.state === 'outdated') {
    await rm(targetPath, { force: true, recursive: true });
  }
  await writeManagedArtifactAsync(targetPath, definition, targetDirectory);
  return {
    relativePath: status.relativePath,
    action: status.state === 'missing' ? 'created' : 'updated',
  };
}

/*** Write either a canonical regular file or a canonical symbolic link. */
async function writeManagedArtifactAsync(
  targetPath: string,
  definition: ManagedFileDefinition,
  targetDirectory: string,
): Promise<void> {
  if (definition.symlinkTarget !== undefined) {
    await symlink(definition.symlinkTarget, targetPath);
    return;
  }
  await writeFile(targetPath, await readCanonicalContents(definition, targetDirectory), 'utf8');
}

/*** Resolve canonical contents for one regular managed file definition. */
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

  throw new Error(`Managed file does not contain regular-file content: ${definition.relativePath}`);
}

/*** Require every managed artifact to define exactly one canonical source. */
function assertSingleContentSource(definition: ManagedFileDefinition): void {
  const sourceCount = [
    definition.sourceUrl,
    definition.contents,
    definition.render,
    definition.symlinkTarget,
  ].filter((value) => value !== undefined).length;
  if (sourceCount !== 1) {
    throw new Error(
      `Managed file must define exactly one content source: ${definition.relativePath}`,
    );
  }
}

/*** Check whether an unknown failure means the target path does not exist. */
function isMissingFileError(error: unknown): boolean {
  return isNodeError(error) && error.code === 'ENOENT';
}

/*** Check whether an unknown failure carries a Node.js error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
