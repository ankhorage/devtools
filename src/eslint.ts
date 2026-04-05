import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import unusedImports from 'eslint-plugin-unused-imports';
import tseslint from 'typescript-eslint';

import type { DevtoolsConfigOptions, FlatConfigItem } from './types.js';

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
    message: "Forbidden in monorepo. Use '@ankh/dnd' (boundary) instead.",
  },
  {
    name: '@ankhorage/react-native-reanimated-dnd-web',
    message: "Forbidden in monorepo. Use '@ankh/dnd' (boundary) instead.",
  },
] as const;

export function createConfig(options: DevtoolsConfigOptions): ReturnType<typeof tseslint.config> {
  const normalizedOptions = {
    allowDefaultProject: [],
    additionalIgnores: [],
    restrictedImports: [],
    overrides: [],
    includePrettier: true,
    ...options,
  };

  const combinedRestrictedImports = [
    ...defaultRestrictedImports,
    ...normalizedOptions.restrictedImports,
  ];

  const plugins = {
    import: importPlugin,
    prettier: prettierPlugin,
    'simple-import-sort': simpleImportSort,
    'unused-imports': unusedImports,
  };

  return tseslint.config(
    {
      ignores: [...defaultIgnores, ...normalizedOptions.additionalIgnores],
    },

    js.configs.recommended,

    ...tseslint.configs.recommendedTypeChecked.map((config) => ({
      ...config,
      files: normalizedOptions.files,
    })),
    ...tseslint.configs.stylisticTypeChecked.map((config) => ({
      ...config,
      files: normalizedOptions.files,
    })),

    {
      files: normalizedOptions.files,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: {
          project: normalizedOptions.project,
          tsconfigRootDir: normalizedOptions.tsconfigRootDir,
          allowDefaultProject: normalizedOptions.allowDefaultProject,
        },
      },
      plugins,
      rules: {
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

        'no-restricted-imports': [
          'error',
          {
            paths: combinedRestrictedImports,
          },
        ],

        'prefer-destructuring': 'off',
        '@typescript-eslint/prefer-destructuring': 'error',

        'simple-import-sort/imports': 'error',
        'simple-import-sort/exports': 'error',

        'unused-imports/no-unused-imports': 'error',
        'unused-imports/no-unused-vars': [
          'error',
          {
            vars: 'all',
            varsIgnorePattern: '^_',
            args: 'after-used',
            argsIgnorePattern: '^_',
          },
        ],

        'import/order': 'off',
        '@typescript-eslint/no-unused-vars': 'off',

        '@typescript-eslint/no-explicit-any': 'error',

        'prettier/prettier': 'error',

        'no-console': 'off',
      },
    },

    ...normalizedOptions.overrides,
    ...(normalizedOptions.includePrettier ? [prettierConfig as FlatConfigItem] : []),
  );
}
