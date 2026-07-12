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
