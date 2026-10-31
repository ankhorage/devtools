import { createKnipConfig } from './src/tools/knip/index.js';

export default createKnipConfig({
  entry: [
    'scripts/sync-renovate-owner.ts',
    'examples/package/src/index.ts',
    'src/tools/skills/assets/**/scripts/**/*.ts',
    'paradox.config.ts',
  ],
  ignoreBinaries: ['ankhorage-repository'],
  ignoreDependencies: ['@techstark/opencv-js'],
  ignoreFiles: [
    'examples/monorepo/eslint.config.mjs',
    'examples/package/eslint.config.mjs',
    'examples/package/prettier.config.cjs',
  ],
});
