import { createKnipConfig } from './src/tools/knip/index.js';

export default createKnipConfig({
  entry: ['scripts/sync-renovate-owner.ts', 'src/tools/skills/assets/**/scripts/**/*.ts'],
  ignoreFiles: [
    'examples/monorepo/eslint.config.mjs',
    'examples/package/eslint.config.mjs',
    'examples/package/prettier.config.cjs',
  ],
});
