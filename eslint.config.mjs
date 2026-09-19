import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createConfig } from './dist/tools/eslint/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir: __dirname,
  project: ['./tsconfig.test.json'],
  files: ['src/**/*.ts'],
  overrides: [
    {
      files: [
        'src/cli/runExternalTool.test.ts',
        'src/package.test.ts',
        'src/tools/skills/managed.test.ts',
        'src/tools/skills/zoraDesignerScripts.test.ts',
      ],
      rules: {
        'max-lines-per-function': ['error', { max: 75, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      files: ['src/tools/skills/zoraDesignerScripts.test.ts'],
      rules: {
        'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
      },
    },
    {
      files: ['src/tools/skills/assets/**/scripts/**/*.ts'],
      rules: {
        complexity: 'off',
        'max-lines': 'off',
        'max-lines-per-function': 'off',
      },
    },
    {
      // Type-aware ESLint currently classifies the released Contracts structure subpath as an
      // error type under this NodeNext project even though tsc resolves and validates it.
      files: [
        'src/features/structure-descriptor-generation/adapters/outbound/generateStructureArtifactFromTypescriptAsync.ts',
        'src/features/structure-descriptor-generation/utils/resolveSemanticStructureWrapper.ts',
        'src/features/structure-descriptor-generation/utils/resolveStructureType.ts',
        'src/types/structure-generation.ts',
      ],
      rules: {
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
      },
    },
  ],
});
