import type tseslint from 'typescript-eslint';

type FlatConfig = ReturnType<typeof tseslint.config>;
export type FlatConfigItem = FlatConfig[number];

export interface RestrictedImport {
  readonly name: string;
  readonly message: string;
}

export type DevtoolsEslintProfile = 'auto' | 'base' | 'react' | 'react-native';
export type ResolvedDevtoolsEslintProfile = Exclude<DevtoolsEslintProfile, 'auto'>;

export interface DevtoolsConfigOptions {
  readonly tsconfigRootDir: string;
  readonly project: string[];
  readonly files: string[];
  readonly profile?: DevtoolsEslintProfile;
  readonly packageJsonPath?: string;
  readonly allowDefaultProject?: string[];
  readonly additionalIgnores?: string[];
  readonly restrictedImports?: RestrictedImport[];
  readonly overrides?: FlatConfigItem[];
  readonly includePrettier?: boolean;
}
