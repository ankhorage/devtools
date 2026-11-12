import { readFile } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';

export interface GitHubArtifactReleaseDescriptor {
  readonly assetName: string;
  readonly assetPath: string;
  readonly buildCommand: string;
  readonly requiredChecks: string;
  readonly verifyCommand: string;
  readonly versionCommand: string;
}

const DESCRIPTOR_PATH = '.ankh/release-distribution.json';

/*** Read the opted-in artifact release contract and reject values unsafe for the managed shell boundary. */
export async function readGitHubArtifactReleaseDescriptorAsync(
  targetDirectory: string,
): Promise<GitHubArtifactReleaseDescriptor | undefined> {
  const descriptorPath = join(targetDirectory, DESCRIPTOR_PATH);
  let source: string;
  try {
    source = await readFile(descriptorPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }

  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error(`${DESCRIPTOR_PATH} must contain valid JSON.`);
  }
  if (!isRecord(value) || value.kind !== 'github-artifact') {
    throw new Error(`${DESCRIPTOR_PATH} must declare kind "github-artifact".`);
  }

  const versionCommand = readCommand(value.versionCommand, 'versionCommand');
  const buildCommand = readCommand(value.buildCommand, 'buildCommand');
  const requiredChecks = readRequiredChecks(value.requiredChecks);
  const verifyCommand = readCommand(value.verifyCommand, 'verifyCommand');
  const assetPath = readRelativePath(value.assetPath, 'assetPath', targetDirectory);
  const assetName = readAssetName(value.assetName);
  return { assetName, assetPath, buildCommand, requiredChecks, verifyCommand, versionCommand };
}

/*** Determine whether the explicitly named artifact contract exists without interpreting its contents. */
export async function hasGitHubArtifactReleaseDescriptorAsync(
  targetDirectory: string,
): Promise<boolean> {
  try {
    await readFile(join(targetDirectory, DESCRIPTOR_PATH), 'utf8');
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/*** Require a command array so checked-in values cannot become a shell program through rendering. */
function readCommand(value: unknown, field: string): string {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((part) => typeof part !== 'string' || part.length === 0)
  ) {
    throw new Error(`${DESCRIPTOR_PATH} ${field} must be a non-empty array of command arguments.`);
  }
  return value.map(shellQuote).join(' ');
}

/*** Keep artifact paths repository-relative and make traversal impossible before workflow rendering. */
function readRelativePath(value: unknown, field: string, targetDirectory: string): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\')) {
    throw new Error(
      `${DESCRIPTOR_PATH} ${field} must be a non-empty slash-separated relative path.`,
    );
  }
  const resolved = resolve(targetDirectory, value);
  const pathFromRoot = relative(targetDirectory, resolved);
  if (pathFromRoot === '' || pathFromRoot.startsWith('../') || pathFromRoot === '..') {
    throw new Error(`${DESCRIPTOR_PATH} ${field} must remain below the repository root.`);
  }
  return pathFromRoot;
}

/*** Restrict the release label to one plain filename, never a path interpreted by GitHub CLI. */
function readAssetName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value)) {
    throw new Error(`${DESCRIPTOR_PATH} assetName must be a plain safe filename.`);
  }
  return value;
}

/*** Require named successful CI gates so an unexecuted or blocked check can never publish an artifact. */
function readRequiredChecks(value: unknown): string {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some(
      (check) =>
        typeof check !== 'string' ||
        check.length === 0 ||
        check.length > 200 ||
        !/^[A-Za-z0-9 ._:/()-]+$/u.test(check),
    )
  ) {
    throw new Error(`${DESCRIPTOR_PATH} requiredChecks must name one or more required CI checks.`);
  }
  return JSON.stringify(value);
}

/*** Quote one argv value for POSIX shell without granting descriptor data shell syntax. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", "'\\\"'\\\"'")}'`;
}

/*** Narrow unknown JSON values before reading descriptor fields. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
