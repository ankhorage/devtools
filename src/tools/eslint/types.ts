import type tseslint from 'typescript-eslint';

type FlatConfig = ReturnType<typeof tseslint.config>;
export type FlatConfigItem = FlatConfig[number];

interface RestrictedImport {
  readonly name: string;
  readonly message: string;
}

export interface DevtoolsConfigOptions {
  readonly tsconfigRootDir: string;
  readonly project: string[];
  readonly files: string[];
  readonly allowDefaultProject?: string[];
  readonly additionalIgnores?: string[];
  readonly restrictedImports?: RestrictedImport[];
  readonly overrides?: FlatConfigItem[];
  readonly includePrettier?: boolean;
}
