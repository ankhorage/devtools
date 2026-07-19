import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

export function resolveEslintProfile(options: DevtoolsConfigOptions): ResolvedDevtoolsEslintProfile {
  const requestedProfile = options.profile ?? 'auto';
  if (requestedProfile !== 'auto') {
    return requestedProfile;
  }

  const packageJsonPath = resolve(options.tsconfigRootDir, options.packageJsonPath ?? 'package.json');
  return resolveEslintProfileFromDetectionInput('auto', readDetectionInput(packageJsonPath));
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
