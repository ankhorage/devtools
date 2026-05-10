import type { KnipConfig } from 'knip';

export interface DevtoolsKnipWorkspaceConfigOptions {
  entry?: string[];
  project?: string[];
  ignore?: string[];
  ignoreDependencies?: (string | RegExp)[];
  ignoreFiles?: string[];
}

export interface DevtoolsKnipConfigOptions extends DevtoolsKnipWorkspaceConfigOptions {
  workspaces?: Record<string, DevtoolsKnipWorkspaceConfigOptions>;
}

export function createKnipConfig(options: DevtoolsKnipConfigOptions = {}): KnipConfig {
  return {
    ...(options.entry === undefined ? {} : { entry: options.entry }),
    ...(options.project === undefined ? {} : { project: options.project }),
    ...(options.ignore === undefined ? {} : { ignore: options.ignore }),
    ...(options.ignoreDependencies === undefined
      ? {}
      : { ignoreDependencies: options.ignoreDependencies }),
    ...(options.ignoreFiles === undefined ? {} : { ignoreFiles: options.ignoreFiles }),
    ...(options.workspaces === undefined ? {} : { workspaces: options.workspaces }),
  } satisfies KnipConfig;
}
