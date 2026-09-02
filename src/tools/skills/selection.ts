import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const BASELINE_SKILL_NAMES = [
  'ankhorage-coding-rules',
  'ankhorage-project-structure',
] as const;

export const PROFILE_SKILL_NAMES = ['zora-designer'] as const;

export type ManagedSkillName =
  (typeof BASELINE_SKILL_NAMES)[number] | (typeof PROFILE_SKILL_NAMES)[number];

const ZORA_DESIGNER_OWNER_PACKAGES = new Set([
  '@ankhorage/studio',
  '@ankhorage/templates',
  '@ankhorage/zora',
]);

const ZORA_DESIGNER_APP_DEPENDENCIES = new Set([
  '@ankhorage/expo-runtime',
  '@ankhorage/runtime',
  '@ankhorage/studio',
  '@ankhorage/templates',
]);

/*** Select baseline and profile-specific managed skills from current repository traits. */
export async function selectManagedSkillNames(
  targetDirectory: string,
): Promise<readonly ManagedSkillName[]> {
  const packageManifest = await readPackageManifest(targetDirectory);
  return isZoraDesignerContext(packageManifest)
    ? [...BASELINE_SKILL_NAMES, ...PROFILE_SKILL_NAMES]
    : BASELINE_SKILL_NAMES;
}

/*** Identify ZORA owners and generated-app authoring repositories without explicit skill lists. */
export function isZoraDesignerContext(packageManifest: Readonly<Record<string, unknown>>): boolean {
  const packageName = readNonEmptyString(packageManifest.name);
  if (packageName !== null && ZORA_DESIGNER_OWNER_PACKAGES.has(packageName)) {
    return true;
  }

  const dependencies = collectDependencyNames(packageManifest);
  return (
    dependencies.has('@ankhorage/zora') &&
    [...ZORA_DESIGNER_APP_DEPENDENCIES].some((dependency) => dependencies.has(dependency))
  );
}

/*** Read package metadata used for profile selection, treating a missing manifest as an empty one. */
async function readPackageManifest(targetDirectory: string): Promise<Record<string, unknown>> {
  try {
    const contents = await readFile(resolve(targetDirectory, 'package.json'), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('package.json must contain a JSON object for managed-skill selection.');
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/*** Combine all dependency sections that describe the repository's current package context. */
function collectDependencyNames(packageManifest: Readonly<Record<string, unknown>>): Set<string> {
  const names = new Set<string>();
  const dependencySections = [
    packageManifest.dependencies,
    packageManifest.devDependencies,
    packageManifest.optionalDependencies,
    packageManifest.peerDependencies,
  ];
  for (const dependencies of dependencySections) {
    if (isRecord(dependencies)) {
      for (const dependency of Object.keys(dependencies)) {
        names.add(dependency);
      }
    }
  }
  return names;
}

/*** Narrow filesystem errors that expose a Node error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/*** Narrow unknown package metadata to a record. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Return a trimmed package name when one is declared. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
