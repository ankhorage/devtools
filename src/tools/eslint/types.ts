import type tseslint from 'typescript-eslint';

type FlatConfig = ReturnType<typeof tseslint.config>;
export type FlatConfigItem = FlatConfig[number];

interface RestrictedImport {
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
