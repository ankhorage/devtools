import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { posix, relative, resolve } from 'node:path';

export const MANIFEST_PATH = '.agents/.devtools-manifest.json';
export const SKILLS_ROOT = '.agents/skills';
export const MANAGED_SKILL_EXECUTABLE_GLOB = `${SKILLS_ROOT}/**/scripts/**`;

const MANIFEST_SCHEMA_VERSION = 1;

interface ManagedSkillManifestEntry {
  readonly files: Readonly<Record<string, string>>;
}

export interface ManagedSkillsManifest {
  readonly schemaVersion: 1;
  readonly sourceDevtoolsVersion: string;
  readonly skills: Readonly<Record<string, ManagedSkillManifestEntry>>;
}

export function createManifestContents(
  contentsByPath: ReadonlyMap<string, Uint8Array>,
  devtoolsVersion: string,
  skillNames: readonly string[],
): string {
  const skills = Object.fromEntries(
    skillNames.map((skillName) => {
      const prefix = `${SKILLS_ROOT}/${skillName}/`;
      const files = Object.fromEntries(
        [...contentsByPath.entries()]
          .filter(([relativePath]) => relativePath.startsWith(prefix))
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([relativePath, contents]) => [relativePath, sha256(contents)]),
      );
      return [skillName, { files }];
    }),
  );

  const manifest: ManagedSkillsManifest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    sourceDevtoolsVersion: devtoolsVersion,
    skills,
  };
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function readManagedSkillsManifest(
  targetDirectory: string,
): Promise<ManagedSkillsManifest | null> {
  try {
    const contents = await readFile(resolveManagedPath(targetDirectory, MANIFEST_PATH), 'utf8');
    return parseManagedSkillsManifest(JSON.parse(contents) as unknown);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export function assertManagedSkillPath(relativePath: string): void {
  assertSafeRelativePath(relativePath);
  if (!relativePath.startsWith(`${SKILLS_ROOT}/`)) {
    throw new Error(`Managed skill manifest path is outside ${SKILLS_ROOT}: ${relativePath}`);
  }
}

export function resolveManagedPath(targetDirectory: string, relativePath: string): string {
  assertSafeRelativePath(relativePath);
  const targetPath = resolve(targetDirectory, ...relativePath.split('/'));
  const relativeTarget = relative(resolve(targetDirectory), targetPath);
  if (relativeTarget.startsWith('..') || relativeTarget === '') {
    throw new Error(`Managed path escapes the target repository: ${relativePath}`);
  }
  return targetPath;
}

export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

function parseManagedSkillsManifest(value: unknown): ManagedSkillsManifest {
  if (!isRecord(value) || value.schemaVersion !== MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported managed skills manifest at ${MANIFEST_PATH}.`);
  }
  if (typeof value.sourceDevtoolsVersion !== 'string' || !isRecord(value.skills)) {
    throw new Error(`Invalid managed skills manifest at ${MANIFEST_PATH}.`);
  }

  const skillEntries: [string, ManagedSkillManifestEntry][] = Object.entries(value.skills).map(
    ([skillName, rawEntry]) => {
      if (!isSafeName(skillName) || !isRecord(rawEntry) || !isRecord(rawEntry.files)) {
        throw new Error(`Invalid managed skill entry in ${MANIFEST_PATH}: ${skillName}`);
      }
      const files = Object.fromEntries(
        Object.entries(rawEntry.files).map(([relativePath, hash]) => {
          assertManagedSkillPath(relativePath);
          if (typeof hash !== 'string' || !/^sha256:[a-f0-9]{64}$/u.test(hash)) {
            throw new Error(`Invalid managed skill hash in ${MANIFEST_PATH}: ${relativePath}`);
          }
          return [relativePath, hash];
        }),
      );
      return [skillName, { files }];
    },
  );

  return {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    sourceDevtoolsVersion: value.sourceDevtoolsVersion,
    skills: Object.fromEntries(skillEntries),
  };
}

function assertSafeRelativePath(relativePath: string): void {
  if (
    relativePath === '' ||
    relativePath !== posix.normalize(relativePath) ||
    relativePath.startsWith('/') ||
    relativePath.split('/').some((segment) => segment === '..' || segment === '')
  ) {
    throw new Error(`Unsafe managed path: ${relativePath}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeName(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function sha256(contents: Uint8Array): string {
  return `sha256:${createHash('sha256').update(contents).digest('hex')}`;
}
