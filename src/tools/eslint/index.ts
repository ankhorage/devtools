import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import reactNativePlugin from 'eslint-plugin-react-native';
import securityPlugin from 'eslint-plugin-security';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

import { resolveEslintProfile } from './profile.js';
import type {
  DevtoolsConfigOptions,
  DevtoolsEslintProfile,
  FlatConfigItem,
  ResolvedDevtoolsEslintProfile,
  RestrictedImport,
} from './types.js';

export const defaultIgnores = [
  '**/ios/**',
  '**/android/**',
  '**/dist/**',
  '**/build/**',
  '**/.expo/**',
  '**/.next/**',
  '**/node_modules/**',
  '**/*.d.ts',
  '**/templates/**',
  '**/files/**',
] as const;

export const defaultRestrictedImports = [
  {
    name: 'react-native-reanimated-dnd',
    message:
      "Forbidden in Ankhorage packages. Use '@ankhorage/react-native-reanimated-dnd-web' directly.",
  },
] as const satisfies readonly RestrictedImport[];

interface NormalizedConfigOptions {
  readonly tsconfigRootDir: string;
  readonly project: string[];
  readonly files: string[];
  readonly allowDefaultProject: string[];
  readonly additionalIgnores: string[];
  readonly restrictedImports: RestrictedImport[];
  readonly overrides: FlatConfigItem[];
  readonly includePrettier: boolean;
}

export function createConfig(options: DevtoolsConfigOptions): ReturnType<typeof tseslint.config> {
  const normalized = normalizeOptions(options);
  const profile = resolveEslintProfile(options);

  return tseslint.config(
    { ignores: [...defaultIgnores, ...normalized.additionalIgnores] },
    js.configs.recommended,
    ...createTypeCheckedConfigs(normalized),
    createBaseConfig(normalized),
    ...createProfileConfigs(profile, normalized.files),
    ...normalized.overrides,
    ...(normalized.includePrettier ? [prettierConfig as FlatConfigItem] : []),
  );
}

function normalizeOptions(options: DevtoolsConfigOptions): NormalizedConfigOptions {
  return {
    tsconfigRootDir: options.tsconfigRootDir,
    project: options.project,
    files: options.files,
    allowDefaultProject: options.allowDefaultProject ?? [],
    additionalIgnores: options.additionalIgnores ?? [],
    restrictedImports: [...(options.restrictedImports ?? [])],
    overrides: [...(options.overrides ?? [])],
    includePrettier: options.includePrettier ?? true,
  };
}

function createTypeCheckedConfigs(options: NormalizedConfigOptions): FlatConfigItem[] {
  const configs = [...tseslint.configs.recommendedTypeChecked, ...tseslint.configs.stylisticTypeChecked];
  return configs.map((config) => ({ ...config, files: options.files }));
}

function createBaseConfig(options: NormalizedConfigOptions): FlatConfigItem {
  return {
    files: options.files,
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: options.project,
        tsconfigRootDir: options.tsconfigRootDir,
        allowDefaultProject: options.allowDefaultProject,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      import: importPlugin,
      prettier: prettierPlugin,
      security: securityPlugin,
      'simple-import-sort': simpleImportSort,
      'unused-imports': unusedImports,
    },
    rules: {
      ...createTypeScriptRules(),
      ...createImportRules(options),
      ...createQualityRules(),
      ...createSecurityRules(),
    },
  };
}

function createTypeScriptRules() {
  return {
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/prefer-readonly': 'error',
    '@typescript-eslint/prefer-optional-chain': 'error',
    '@typescript-eslint/prefer-as-const': 'error',
    '@typescript-eslint/no-unnecessary-type-arguments': 'error',
    '@typescript-eslint/no-unnecessary-condition': 'error',
    '@typescript-eslint/no-unnecessary-type-constraint': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    '@typescript-eslint/prefer-nullish-coalescing': 'error',
    '@typescript-eslint/prefer-destructuring': 'error',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
  } as const;
}

function createImportRules(options: NormalizedConfigOptions) {
  return {
    'no-restricted-imports': [
      'error',
      { paths: [...defaultRestrictedImports, ...options.restrictedImports] },
    ],
    'prefer-destructuring': 'off',
    'simple-import-sort/imports': 'error',
    'simple-import-sort/exports': 'error',
    'unused-imports/no-unused-imports': 'error',
    'unused-imports/no-unused-vars': [
      'error',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
    'import/order': 'off',
    'prettier/prettier': 'error',
    'no-console': 'off',
  } as const;
}

function createQualityRules() {
  return {
    'max-lines-per-function': [
      'error',
      { max: 50, skipBlankLines: true, skipComments: true },
    ],
    'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
    complexity: ['error', { max: 15, variant: 'modified' }],
  } as const;
}

function createSecurityRules() {
  return {
    'security/detect-object-injection': 'warn',
    'security/detect-non-literal-require': 'error',
  } as const;
}

function createProfileConfigs(
  profile: ResolvedDevtoolsEslintProfile,
  files: string[],
): FlatConfigItem[] {
  if (profile === 'base') {
    return [];
  }

  const reactConfig = createReactConfig(files);
  return profile === 'react-native' ? [reactConfig, createReactNativeConfig(files)] : [reactConfig];
}

function createReactConfig(files: string[]): FlatConfigItem {
  return {
    files,
    plugins: { react: reactPlugin, 'react-hooks': reactHooksPlugin },
    settings: { react: { version: 'detect' } },
    rules: {
      'react/no-danger': 'error',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      'react-hooks/immutability': 'error',
      'react-hooks/purity': 'error',
      'react-hooks/refs': 'error',
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/set-state-in-render': 'error',
      'react-hooks/static-components': 'error',
    },
  };
}

function createReactNativeConfig(files: string[]): FlatConfigItem {
  return {
    files,
    plugins: { 'react-native': reactNativePlugin },
    rules: {
      'react-native/no-inline-styles': 'warn',
      'react-native/no-unused-styles': 'error',
      'react-native/no-single-element-style-arrays': 'error',
    },
  };
}

export type {
  DevtoolsConfigOptions,
  DevtoolsEslintProfile,
  FlatConfigItem,
  ResolvedDevtoolsEslintProfile,
  RestrictedImport,
} from './types.js';
