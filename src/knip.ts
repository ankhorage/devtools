import type { KnipConfig } from 'knip';

export interface DevtoolsKnipConfigOptions {
  entry?: string[];
  project?: string[];
  ignore?: string[];
  ignoreDependencies?: string[];
  workspaces?: KnipConfig['workspaces'];
}

export const defaultKnipEntry = [
  'src/index.{ts,tsx,js,jsx}',
  'src/cli.{ts,tsx,js,jsx}',
  'src/main.{ts,tsx,js,jsx}',
  'src/**/*.test.{ts,tsx,js,jsx}',
  'src/**/*.spec.{ts,tsx,js,jsx}',
  'examples/**/*.{ts,tsx,js,jsx}',
  'eslint.config.{js,mjs,cjs,ts}',
  'prettier.config.{js,mjs,cjs,ts}',
  'knip.config.ts',
] as const;

export const defaultKnipProject = [
  'src/**/*.{ts,tsx,js,jsx}',
  'examples/**/*.{ts,tsx,js,jsx}',
  '*.{ts,js,mjs,cjs}',
  '.github/workflows/*.{yml,yaml}',
] as const;

export const defaultKnipIgnores = [
  'dist/**',
  'build/**',
  'coverage/**',
  '.expo/**',
  '.next/**',
  'node_modules/**',
] as const;

export function createKnipConfig(options: DevtoolsKnipConfigOptions = {}): KnipConfig {
  return {
    entry: [...defaultKnipEntry, ...(options.entry ?? [])],
    project: [...defaultKnipProject, ...(options.project ?? [])],
    ignore: [...defaultKnipIgnores, ...(options.ignore ?? [])],
    ...(options.ignoreDependencies === undefined
      ? {}
      : { ignoreDependencies: options.ignoreDependencies }),
    ...(options.workspaces === undefined ? {} : { workspaces: options.workspaces }),
  } satisfies KnipConfig;
}
