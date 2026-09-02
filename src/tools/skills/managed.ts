import { lstat, mkdir, readdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  ManagedFileStatus,
  ManagedFileSyncAction,
  ManagedFileSyncResult,
} from '../shared/managedFiles.js';
import {
  assertManagedSkillPath,
  createManifestContents,
  isNodeError,
  type ManagedSkillsManifest,
  MANIFEST_PATH,
  readManagedSkillsManifest,
  resolveManagedPath,
  SKILLS_ROOT,
} from './manifest.js';
import { type ManagedSkillName, selectManagedSkillNames } from './selection.js';

interface ManagedSkillPlan {
  readonly contentsByPath: ReadonlyMap<string, Uint8Array>;
  readonly manifestContents: string;
  readonly statuses: readonly ManagedFileStatus[];
}

export async function inspectManagedSkills(
  targetDirectory: string,
  devtoolsVersion: string,
): Promise<readonly ManagedFileStatus[]> {
  return (await createManagedSkillPlan(targetDirectory, devtoolsVersion)).statuses;
}

export async function syncManagedSkills(
  targetDirectory: string,
  devtoolsVersion: string,
  options: { readonly dryRun: boolean },
): Promise<readonly ManagedFileSyncResult[]> {
  const plan = await createManagedSkillPlan(targetDirectory, devtoolsVersion);
  const results: ManagedFileSyncResult[] = [];

  for (const status of plan.statuses) {
    const action = getSyncAction(status, options.dryRun);
    if (!options.dryRun) {
      await applySkillAction(targetDirectory, status, action, plan);
    }
    results.push({ relativePath: status.relativePath, action });
  }

  return results;
}

async function applySkillAction(
  targetDirectory: string,
  status: ManagedFileStatus,
  action: ManagedFileSyncAction,
  plan: ManagedSkillPlan,
): Promise<void> {
  if (action === 'unchanged') {
    return;
  }

  const targetPath = resolveManagedPath(targetDirectory, status.relativePath);
  await assertNoSymlinkSegments(targetDirectory, status.relativePath);

  if (action === 'removed') {
    await unlink(targetPath);
    await removeEmptyParentDirectories(targetDirectory, dirname(targetPath));
    return;
  }

  await mkdir(dirname(targetPath), { recursive: true });
  const contents =
    status.relativePath === MANIFEST_PATH
      ? plan.manifestContents
      : plan.contentsByPath.get(status.relativePath);
  if (contents === undefined) {
    throw new Error(`Missing canonical skill contents for ${status.relativePath}.`);
  }
  await writeFile(targetPath, contents);
}

async function assertNoSymlinkSegments(
  targetDirectory: string,
  relativePath: string,
): Promise<void> {
  let currentPath = targetDirectory;
  for (const segment of relativePath.split('/')) {
    currentPath = join(currentPath, segment);
    try {
      const stats = await lstat(currentPath);
      if (stats.isSymbolicLink()) {
        throw new Error(`Managed skill path must not contain symbolic links: ${relativePath}`);
      }
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }
}

async function collectCanonicalSkillFiles(
  skillNames: readonly ManagedSkillName[],
): Promise<ReadonlyMap<string, Uint8Array>> {
  const contentsByPath = new Map<string, Uint8Array>();

  for (const skillName of skillNames) {
    const sourceDirectory = fileURLToPath(new URL(`./assets/${skillName}/`, import.meta.url));
    const files = await readDirectoryFiles(sourceDirectory);
    assertSkillName(skillName, files);
    for (const [skillRelativePath, contents] of files) {
      contentsByPath.set(`${SKILLS_ROOT}/${skillName}/${skillRelativePath}`, contents);
    }
  }

  return contentsByPath;
}

async function collectObsoletePaths(
  targetDirectory: string,
  desiredPaths: ReadonlySet<string>,
  previousManifest: ManagedSkillsManifest | null,
  skillNames: readonly ManagedSkillName[],
): Promise<readonly string[]> {
  const obsoletePaths = new Set<string>();

  for (const skillName of skillNames) {
    const skillRoot = `${SKILLS_ROOT}/${skillName}`;
    for (const existingPath of await readTargetDirectoryFiles(targetDirectory, skillRoot)) {
      if (!desiredPaths.has(existingPath)) {
        obsoletePaths.add(existingPath);
      }
    }
  }

  if (previousManifest !== null) {
    for (const [skillName, entry] of Object.entries(previousManifest.skills)) {
      if (skillNames.includes(skillName as ManagedSkillName)) {
        continue;
      }
      for (const managedPath of Object.keys(entry.files)) {
        if (await isRegularManagedFile(targetDirectory, managedPath)) {
          obsoletePaths.add(managedPath);
        }
      }
    }
  }

  return [...obsoletePaths].sort();
}

async function createManagedSkillPlan(
  targetDirectory: string,
  devtoolsVersion: string,
): Promise<ManagedSkillPlan> {
  const previousManifest = await readManagedSkillsManifest(targetDirectory);
  const skillNames = await selectManagedSkillNames(targetDirectory);
  const contentsByPath = await collectCanonicalSkillFiles(skillNames);
  const desiredPaths = new Set(contentsByPath.keys());
  const manifestContents = createManifestContents(contentsByPath, devtoolsVersion, skillNames);
  const statuses: ManagedFileStatus[] = [];

  for (const [relativePath, contents] of [...contentsByPath.entries()].sort()) {
    statuses.push(await inspectDesiredFile(targetDirectory, relativePath, contents));
  }
  for (const relativePath of await collectObsoletePaths(
    targetDirectory,
    desiredPaths,
    previousManifest,
    skillNames,
  )) {
    statuses.push({ relativePath, state: 'obsolete' });
  }
  statuses.push(
    await inspectDesiredFile(targetDirectory, MANIFEST_PATH, Buffer.from(manifestContents)),
  );

  return { contentsByPath, manifestContents, statuses };
}

function getSyncAction(status: ManagedFileStatus, dryRun: boolean): ManagedFileSyncAction {
  if (status.state === 'current') {
    return 'unchanged';
  }
  if (status.state === 'obsolete') {
    return dryRun ? 'would-remove' : 'removed';
  }
  if (status.state === 'missing') {
    return dryRun ? 'would-create' : 'created';
  }
  return dryRun ? 'would-update' : 'updated';
}

async function inspectDesiredFile(
  targetDirectory: string,
  relativePath: string,
  canonicalContents: Uint8Array,
): Promise<ManagedFileStatus> {
  await assertNoSymlinkSegments(targetDirectory, relativePath);
  try {
    const targetContents = await readFile(resolveManagedPath(targetDirectory, relativePath));
    return {
      relativePath,
      state: Buffer.compare(targetContents, canonicalContents) === 0 ? 'current' : 'outdated',
    };
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { relativePath, state: 'missing' };
    }
    throw error;
  }
}

async function isRegularManagedFile(
  targetDirectory: string,
  relativePath: string,
): Promise<boolean> {
  assertManagedSkillPath(relativePath);
  await assertNoSymlinkSegments(targetDirectory, relativePath);
  try {
    return (await lstat(resolveManagedPath(targetDirectory, relativePath))).isFile();
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function readDirectoryFiles(
  directory: string,
  prefix = '',
): Promise<ReadonlyMap<string, Uint8Array>> {
  const files = new Map<string, Uint8Array>();
  const entries = (await readdir(directory, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const entryPath = join(directory, entry.name);
    const relativePath = prefix === '' ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      for (const nestedFile of await readDirectoryFiles(entryPath, relativePath)) {
        files.set(...nestedFile);
      }
    } else if (entry.isFile()) {
      files.set(relativePath, await readFile(entryPath));
    } else {
      throw new Error(
        `Canonical skill assets must contain only files and directories: ${entryPath}`,
      );
    }
  }

  return files;
}

async function readTargetDirectoryFiles(
  targetDirectory: string,
  relativeDirectory: string,
): Promise<readonly string[]> {
  await assertNoSymlinkSegments(targetDirectory, relativeDirectory);
  const directory = resolveManagedPath(targetDirectory, relativeDirectory);
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...(await readTargetDirectoryFiles(targetDirectory, relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Managed skill trees must not contain symbolic links: ${relativePath}`);
    }
  }
  return files;
}

async function removeEmptyParentDirectories(
  targetDirectory: string,
  initialDirectory: string,
): Promise<void> {
  const stopDirectory = resolveManagedPath(targetDirectory, SKILLS_ROOT);
  let directory = initialDirectory;

  while (directory.startsWith(`${stopDirectory}${sep}`)) {
    try {
      await rmdir(directory);
    } catch (error) {
      if (isNodeError(error) && ['ENOENT', 'ENOTEMPTY'].includes(error.code ?? '')) {
        return;
      }
      throw error;
    }
    directory = dirname(directory);
  }
}

function assertSkillName(expectedName: string, files: ReadonlyMap<string, Uint8Array>): void {
  const skillFile = files.get('SKILL.md');
  if (skillFile === undefined) {
    throw new Error(`Canonical skill is missing SKILL.md: ${expectedName}`);
  }
  const match = /^---\n[\s\S]*?^name:\s*(.+)$/mu.exec(Buffer.from(skillFile).toString('utf8'));
  if (match?.[1]?.trim() !== expectedName) {
    throw new Error(`Canonical skill directory and frontmatter names differ: ${expectedName}`);
  }
}
