import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { resolveProjectPackageJsonPath } from './packageJsonPath.js';
import type { DevtoolsConfigOptions } from './types.js';

const SOURCE_EXTENSIONS = ['ts', 'tsx', 'js', 'jsx', 'mts', 'cts', 'mjs', 'cjs'] as const;
const OUTPUT_EXTENSION = /(?:\.d)?\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;

/**
 * Resolve package root entrypoint source files that may act as public barrels.
 * Named subpath exports are public API surfaces, but they do not gain forwarding ownership.
 */
export function resolvePackageEntrypointFiles(options: DevtoolsConfigOptions): string[] {
  const packageJsonPath = resolveProjectPackageJsonPath(options);
  if (packageJsonPath === null) return [];

  const packageJson = readPackageJson(packageJsonPath);
  const { main, types, exports: packageExports } = packageJson;
  const targets = [
    ...collectStringTargets(main),
    ...collectStringTargets(types),
    ...collectRootExportTargets(packageExports),
  ];

  return [...new Set(targets.flatMap((target) => toSourceCandidates(target, packageJsonPath)))];
}

function readPackageJson(packageJsonPath: string): Record<string, unknown> {
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Expected package.json to contain a JSON object: ${packageJsonPath}`);
  }
  return parsed;
}

function collectRootExportTargets(value: unknown): string[] {
  if (!isRecord(value)) return collectStringTargets(value);

  const rootEntry = Object.entries(value).find(([key]) => key === '.')?.[1];
  if (rootEntry !== undefined) return collectStringTargets(rootEntry);

  const hasSubpathKeys = Object.keys(value).some((key) => key.startsWith('.'));
  return hasSubpathKeys ? [] : collectStringTargets(value);
}

function collectStringTargets(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStringTargets);
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(collectStringTargets);
}

function toSourceCandidates(target: string, packageJsonPath: string): string[] {
  const normalizedTarget = target.replace(/^\.\//u, '');
  const sourceTarget = normalizedTarget.startsWith('dist/')
    ? `src/${normalizedTarget.slice('dist/'.length)}`
    : normalizedTarget;
  if (!sourceTarget.startsWith('src/')) return [];

  const sourceBase = sourceTarget.replace(OUTPUT_EXTENSION, '');
  const absoluteBase = resolve(dirname(packageJsonPath), sourceBase);
  return SOURCE_EXTENSIONS.map((extension) => `${absoluteBase}.${extension}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
