import { readFileSync } from 'node:fs';

import type {
  ProjectDependencyMap,
  ProjectDetectionInput,
} from '@ankhorage/project-detector/types';
import { isRecord } from '@ankhorage/utility/object';

import { resolveProjectPackageJsonPath } from './packageJsonPath.js';
import { resolveEslintProfileFromDetectionInput } from './resolveEslintProfileFromDetectionInput.js';
import type { DevtoolsConfigOptions, ResolvedDevtoolsEslintProfile } from './types.js';

/*** Read the consuming package metadata and resolve its requested ESLint profile. */
export function resolveEslintProfile(
  options: DevtoolsConfigOptions,
): ResolvedDevtoolsEslintProfile {
  const requestedProfile = options.profile ?? 'auto';
  if (requestedProfile !== 'auto') return requestedProfile;

  const packageJsonPath = resolveProjectPackageJsonPath(options);
  const input = packageJsonPath === null ? {} : readDetectionInput(packageJsonPath);
  return resolveEslintProfileFromDetectionInput('auto', input);
}

/*** Normalize relevant manifest fields without evaluating project configuration. */
function readDetectionInput(packageJsonPath: string): ProjectDetectionInput {
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected package.json to contain a JSON object: ${packageJsonPath}`);
  }

  return {
    ...optionalDependencyMap('dependencies', parsed.dependencies),
    ...optionalDependencyMap('devDependencies', parsed.devDependencies),
    ...optionalDependencyMap('peerDependencies', parsed.peerDependencies),
    ...optionalEngines(parsed.engines),
    ...(typeof parsed.packageManager === 'string' ? { packageManager: parsed.packageManager } : {}),
  };
}

/*** Include one dependency section only when it contains a record. */
function optionalDependencyMap(
  key: 'dependencies' | 'devDependencies' | 'peerDependencies',
  value: unknown,
): Partial<ProjectDetectionInput> {
  const dependencyMap = toDependencyMap(value);
  return dependencyMap === undefined ? {} : { [key]: dependencyMap };
}

/*** Retain string package ranges from one manifest dependency section. */
function toDependencyMap(value: unknown): ProjectDependencyMap | undefined {
  if (!isRecord(value)) return undefined;

  return Object.fromEntries(
    Object.entries(value).flatMap(([name, version]) =>
      typeof version === 'string' ? [[name, version]] : [],
    ),
  );
}

/*** Retain runtime engine signals used by the canonical detector. */
function optionalEngines(value: unknown): Partial<ProjectDetectionInput> {
  if (!isRecord(value)) return {};

  const engines = {
    ...(typeof value.bun === 'string' ? { bun: value.bun } : {}),
    ...(typeof value.node === 'string' ? { node: value.node } : {}),
  };
  return Object.keys(engines).length === 0 ? {} : { engines };
}
