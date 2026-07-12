import { createConfig } from './dist/tools/eslint/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir: __dirname,
  project: ['./tsconfig.test.json'],
  files: ['src/**/*.ts'],
});
