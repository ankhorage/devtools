import type { KnipConfig } from 'knip';

export interface DevtoolsKnipConfigOptions {
  entry?: string[];
  project?: string[];
  ignore?: string[];
  ignoreDependencies?: string[];
  workspaces?: KnipConfig['workspaces'];
}

export function createKnipConfig(options: DevtoolsKnipConfigOptions = {}): KnipConfig {
  const config: KnipConfig = {};

  if (options.entry !== undefined) {
    config.entry = options.entry;
  }

  if (options.project !== undefined) {
    config.project = options.project;
  }

  if (options.ignore !== undefined) {
    config.ignore = options.ignore;
  }

  if (options.ignoreDependencies !== undefined) {
    config.ignoreDependencies = options.ignoreDependencies;
  }

  if (options.workspaces !== undefined) {
    config.workspaces = options.workspaces;
  }

  return config;
}
