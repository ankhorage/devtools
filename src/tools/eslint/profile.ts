import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  detectProject,
  type ProjectDependencyMap,
  type ProjectDetectionInput,
} from '@ankhorage/utility/project';

import type {
  DevtoolsConfigOptions,
  DevtoolsEslintProfile,
  ResolvedDevtoolsEslintProfile,
} from './types.js';

export function resolveEslintProfile(
  options: DevtoolsConfigOptions,
): ResolvedDevtoolsEslintProfile {
  const requestedProfile = options.profile ?? 'auto';
  if (requestedProfile !== 'auto') {
    return requestedProfile;
  }

  const packageJsonPath = resolveProjectPackageJsonPath(options);
  const input = packageJsonPath === null ? {} : readDetectionInput(packageJsonPath);
  return resolveEslintProfileFromDetectionInput('auto', input);
}

export function resolveEslintProfileFromDetectionInput(
  requestedProfile: DevtoolsEslintProfile,
  input: ProjectDetectionInput,
): ResolvedDevtoolsEslintProfile {
  if (requestedProfile !== 'auto') {
    return requestedProfile;
  }

  const { traits } = detectProject(input);
  if (traits.has('react-native') || traits.has('expo')) {
    return 'react-native';
  }

  return traits.has('react') ? 'react' : 'base';
}

function resolveProjectPackageJsonPath(options: DevtoolsConfigOptions): string | null {
  if (options.packageJsonPath !== undefined) {
    return resolve(options.tsconfigRootDir, options.packageJsonPath);
  }

  let directory = resolve(options.tsconfigRootDir);
  for (;;) {
    const candidate = resolve(directory, 'package.json');
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(directory);
    if (parent === directory) {
      return null;
    }
    directory = parent;
  }
}

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

function optionalDependencyMap(
  key: 'dependencies' | 'devDependencies' | 'peerDependencies',
  value: unknown,
): Partial<ProjectDetectionInput> {
  const dependencyMap = toDependencyMap(value);
  return dependencyMap === undefined ? {} : { [key]: dependencyMap };
}

function toDependencyMap(value: unknown): ProjectDependencyMap | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const dependencies: Record<string, string> = {};
  for (const [name, version] of Object.entries(value)) {
    if (typeof version === 'string') {
      dependencies[name] = version;
    }
  }
  return dependencies;
}

function optionalEngines(value: unknown): Partial<ProjectDetectionInput> {
  if (!isRecord(value)) {
    return {};
  }

  const engines = {
    ...(typeof value.bun === 'string' ? { bun: value.bun } : {}),
    ...(typeof value.node === 'string' ? { node: value.node } : {}),
  };
  return Object.keys(engines).length === 0 ? {} : { engines };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
