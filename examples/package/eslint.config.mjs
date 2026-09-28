import { createConfig } from '@ankhorage/devtools/eslint';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/***
 * Configure ESLint for a standalone TypeScript package with the Devtools shared policy.
 *
 * @usage
 * @readme
 * @title Standalone package ESLint configuration
 */
export default createConfig({
  tsconfigRootDir: __dirname,
  project: ['./tsconfig.json'],
  files: ['src/**/*.{ts,tsx}'],
});
