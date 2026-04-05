import { createConfig } from '@ankhorage/devtools/eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir: __dirname,
  project: ['./tsconfig.eslint.json'],
  files: ['src/**/*.{ts,tsx}'],
});
