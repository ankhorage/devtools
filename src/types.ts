import type tseslint from 'typescript-eslint';

export type FlatConfig = ReturnType<typeof tseslint.config>;
export type FlatConfigItem = FlatConfig[number];

export interface RestrictedImport {
  name: string;
  message: string;
}

export interface DevtoolsConfigOptions {
  tsconfigRootDir: string;
  project: string[];
  files: string[];
  allowDefaultProject?: string[];
  additionalIgnores?: string[];
  restrictedImports?: RestrictedImport[];
  overrides?: FlatConfigItem[];
  includePrettier?: boolean;
}
