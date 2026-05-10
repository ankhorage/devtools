import type { KnipConfig } from 'knip';

export interface DevtoolsKnipConfigOptions {
  entry?: string[];
  project?: string[];
  ignore?: string[];
  ignoreDependencies?: string[];
  workspaces?: KnipConfig['workspaces'];
}

export const defaultKnipProject = ['src/**/*.{ts,tsx,js,jsx}'] as const;

export function createKnipConfig(options: DevtoolsKnipConfigOptions = {}): KnipConfig {
  const config: KnipConfig = {
    project: [...defaultKnipProject, ...(options.project ?? [])],
  };

  if (options.entry !== undefined) {
    config.entry = options.entry;
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
