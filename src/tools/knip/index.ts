/***
 * Build shared Knip configuration while preserving repository-specific discovery.
 *
 * `createKnipConfig` keeps Knip zero-config discovery. Repositories can add narrow entries, project globs, ignored files,
 * binaries, dependencies, and workspace overrides without duplicating the shared Knip version.
 *
 * `createKnipMonorepoConfig` adds a root workspace plus conventional `packages/*` and `apps/*`
 * workspace globs. Callers can override those globs, provide workspace defaults, and replace or
 * extend individual workspace configuration deterministically.
 *
 * @readme
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { KnipConfig } from 'knip';

import { EXAMPLES_ESLINT_OWNERSHIP_MARKER } from '../../constants/eslint.js';

export interface DevtoolsKnipWorkspaceConfigOptions {
  readonly entry?: string[];
  readonly project?: string[];
  readonly ignore?: string[];
  readonly ignoreBinaries?: string[];
  readonly ignoreDependencies?: (string | RegExp)[];
  readonly ignoreFiles?: string[];
}

export interface DevtoolsKnipConfigOptions extends DevtoolsKnipWorkspaceConfigOptions {
  readonly workspaces?: Record<string, DevtoolsKnipWorkspaceConfigOptions>;
}

export interface DevtoolsKnipMonorepoConfigOptions {
  readonly root?: DevtoolsKnipWorkspaceConfigOptions;
  readonly workspaceDefaults?: DevtoolsKnipWorkspaceConfigOptions;
  readonly workspaceGlobs?: string[];
  readonly workspaces?: Record<string, DevtoolsKnipWorkspaceConfigOptions>;
}

const DEFAULT_MONOREPO_WORKSPACE_GLOBS = ['packages/*', 'apps/*'] as const;
const MANAGED_EXAMPLES_ESLINT_CONFIG = 'eslint.examples.config.mjs';
const OPTIONAL_EXAMPLES_ENTRY = 'examples/*/index.ts';

/*** Build shared Knip configuration while preserving repository-specific discovery. */
export function createKnipConfig(options: DevtoolsKnipConfigOptions = {}): KnipConfig {
  const entry = filterOptionalPath(options.entry, OPTIONAL_EXAMPLES_ENTRY, hasExamplesIndexEntry());
  const ignoredFiles = [
    ...(filterOptionalPath(
      options.ignoreFiles,
      MANAGED_EXAMPLES_ESLINT_CONFIG,
      existsSync(MANAGED_EXAMPLES_ESLINT_CONFIG),
    ) ?? []),
    ...(hasManagedExamplesEslintConfig() ? [MANAGED_EXAMPLES_ESLINT_CONFIG] : []),
  ];
  return {
    ...(entry === undefined ? {} : { entry }),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
    ...(options.ignoreBinaries === undefined ? {} : { ignoreBinaries: options.ignoreBinaries }),
    ...(options.ignoreDependencies === undefined
      ? {}
      : { ignoreDependencies: options.ignoreDependencies }),
    ...(ignoredFiles.length === 0 ? {} : { ignoreFiles: [...new Set(ignoredFiles)] }),
    ...(options.workspaces === undefined ? {} : { workspaces: options.workspaces }),
  } satisfies KnipConfig;
}

/*** Retain an optional starter path only when the target repository contains it. */
function filterOptionalPath(
  paths: string[] | undefined,
  optionalPath: string,
  isPresent: boolean,
): string[] | undefined {
  return paths === undefined || isPresent ? paths : paths.filter((path) => path !== optionalPath);
}

/*** Report whether a conventional starter example entry exists. */
function hasExamplesIndexEntry(): boolean {
  if (!existsSync('examples')) return false;
  return readdirSync('examples', { withFileTypes: true }).some(
    (entry) => entry.isDirectory() && existsSync(join('examples', entry.name, 'index.ts')),
  );
}

/*** Build shared monorepo Knip configuration. */
export function createKnipMonorepoConfig(
  options: DevtoolsKnipMonorepoConfigOptions = {},
): KnipConfig {
  const explicitWorkspaces = options.workspaces ?? {};
  const workspaceGlobs = options.workspaceGlobs ?? [...DEFAULT_MONOREPO_WORKSPACE_GLOBS];
  const workspaces: Record<string, DevtoolsKnipWorkspaceConfigOptions> = {
    '.': options.root ?? {},
  };

  for (const workspaceGlob of workspaceGlobs) {
    workspaces[workspaceGlob] = {
      ...(options.workspaceDefaults ?? {}),
      ...(explicitWorkspaces[workspaceGlob] ?? {}),
    };
  }

  for (const [workspaceGlob, workspaceConfig] of Object.entries(explicitWorkspaces)) {
    workspaces[workspaceGlob] = workspaceConfig;
  }

  return createKnipConfig({ workspaces });
}

/*** Report whether the examples ESLint config is owned by Devtools. */
function hasManagedExamplesEslintConfig(): boolean {
  return (
    existsSync(MANAGED_EXAMPLES_ESLINT_CONFIG) &&
    readFileSync(MANAGED_EXAMPLES_ESLINT_CONFIG, 'utf8').startsWith(
      EXAMPLES_ESLINT_OWNERSHIP_MARKER,
    )
  );
}
