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
import type { KnipConfig } from 'knip';

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

/*** Build shared Knip configuration while preserving repository-specific discovery. */
export function createKnipConfig(options: DevtoolsKnipConfigOptions = {}): KnipConfig {
  return {
    ...(options.entry === undefined ? {} : { entry: options.entry }),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
    ...(options.ignoreBinaries === undefined ? {} : { ignoreBinaries: options.ignoreBinaries }),
    ...(options.ignoreDependencies === undefined
      ? {}
      : { ignoreDependencies: options.ignoreDependencies }),
    ...(options.ignoreFiles === undefined ? {} : { ignoreFiles: options.ignoreFiles }),
    ...(options.workspaces === undefined ? {} : { workspaces: options.workspaces }),
  } satisfies KnipConfig;
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
