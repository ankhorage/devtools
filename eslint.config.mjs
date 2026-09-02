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
  ],
});
