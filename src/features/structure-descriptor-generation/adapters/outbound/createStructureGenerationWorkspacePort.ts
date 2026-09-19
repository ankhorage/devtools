import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

import { isRecord } from '@ankhorage/utility/object';

import type {
  StructureGenerationConfig,
  StructureGenerationPackage,
  StructureGenerationRoot,
  StructureGenerationWorkspacePort,
} from '../../../../types/structure-generation.js';
import { generateStructureArtifactFromTypescriptAsync } from './generateStructureArtifactFromTypescriptAsync.js';

/*** Create the bounded filesystem/compiler adapter used by structure build and check commands. */
export function createStructureGenerationWorkspacePort(
  targetDirectory: string,
): StructureGenerationWorkspacePort {
  return {
    readPackageAsync: async () => readStructurePackageAsync(targetDirectory),
    generateArtifactAsync: (packageConfig) =>
      Promise.resolve(generateStructureArtifactFromTypescriptAsync(targetDirectory, packageConfig)),
    readOutputAsync: async (relativePath) => readOptionalFileAsync(targetDirectory, relativePath),
    writeOutputAsync: async (relativePath, source) =>
      writeGeneratedFileAsync(targetDirectory, relativePath, source),
  };
}

/*** Read and validate the package-owned structure generation declaration. */
async function readStructurePackageAsync(
  targetDirectory: string,
): Promise<StructureGenerationPackage | null> {
  const packagePath = resolve(targetDirectory, 'package.json');
  const raw = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
  if (!isRecord(raw)) throw new Error('package.json must contain one JSON object.');

  const { ankh, name, version } = raw;
  if (typeof name !== 'string' || name.trim() === '') {
    throw new Error('package.json needs a package name.');
  }
  if (typeof version !== 'string' || version.trim() === '') {
    throw new Error('package.json needs a package version.');
  }
  if (!isRecord(ankh) || ankh.structure === undefined) return null;
  return { name, version, config: parseStructureConfig(ankh.structure, targetDirectory) };
}

/*** Parse explicit structure roots and one generated output path without accepting path escapes. */
function parseStructureConfig(value: unknown, targetDirectory: string): StructureGenerationConfig {
  if (!isRecord(value)) throw new Error('ankh.structure must define output and roots.');
  const { output: configuredOutput, roots: configuredRoots } = value;
  if (typeof configuredOutput !== 'string' || !isRecord(configuredRoots)) {
    throw new Error('ankh.structure must define output and roots.');
  }

  const output = validateRelativePath(configuredOutput, targetDirectory, 'ankh.structure.output');
  const roots = Object.fromEntries(
    Object.entries(configuredRoots)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, root]) => [name, parseRoot(name, root, targetDirectory)]),
  );
  if (Object.keys(roots).length === 0) throw new Error('ankh.structure.roots must not be empty.');
  return { output, roots };
}

/*** Parse one explicit root source/export declaration. */
function parseRoot(name: string, value: unknown, targetDirectory: string): StructureGenerationRoot {
  if (
    name.trim() === '' ||
    !isRecord(value) ||
    typeof value.source !== 'string' ||
    typeof value.export !== 'string' ||
    value.export.trim() === ''
  ) {
    throw new Error(`Invalid structural root "${name}".`);
  }

  return {
    source: validateRelativePath(value.source, targetDirectory, `structure root ${name}`),
    export: value.export,
  };
}

/*** Require repository-relative paths that resolve inside the selected package root. */
function validateRelativePath(value: string, targetDirectory: string, label: string): string {
  if (value.trim() === '' || isAbsolute(value)) throw new Error(`${label} must be relative.`);
  const absolute = resolve(targetDirectory, value);
  const resolved = relative(targetDirectory, absolute);
  if (resolved === '..' || resolved.startsWith('../') || resolved.startsWith('..\\')) {
    throw new Error(`${label} must stay inside the package root.`);
  }
  return value.replaceAll('\\', '/');
}

/*** Read an optional generated artifact without treating absence as a filesystem error. */
async function readOptionalFileAsync(
  targetDirectory: string,
  relativePath: string,
): Promise<string | null> {
  try {
    return await readFile(resolve(targetDirectory, relativePath), 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

/*** Write one generated artifact after ensuring its owning directory exists. */
async function writeGeneratedFileAsync(
  targetDirectory: string,
  relativePath: string,
  source: string,
): Promise<void> {
  const output = resolve(targetDirectory, relativePath);
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, source, 'utf8');
}

/*** Narrow Node filesystem failures without unsafe error casts. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
