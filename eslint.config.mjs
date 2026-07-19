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
      files: ['src/cli/runExternalTool.test.ts', 'src/package.test.ts'],
      rules: {
        'max-lines-per-function': [
          'error',
          { max: 75, skipBlankLines: true, skipComments: true },
        ],
      },
    },
  ],
});
