import { createKnipConfig } from './src/tools/knip/index.js';

export default createKnipConfig({
  ignoreFiles: [
    'examples/monorepo/eslint.config.mjs',
    'examples/package/eslint.config.mjs',
    'examples/package/prettier.config.cjs',
  ],
});
