import { createKnipConfig } from './src/tools/knip/index.js';

export default createKnipConfig({
  entry: [
    'scripts/sync-renovate-owner.ts',
    'src/tools/skills/assets/zora-designer/scripts/audit.mjs',
    'src/tools/skills/assets/zora-designer/scripts/owner-api.mjs',
    'src/tools/skills/assets/zora-designer/scripts/scaffold-template.mjs',
  ],
  ignoreFiles: [
    'examples/monorepo/eslint.config.mjs',
    'examples/package/eslint.config.mjs',
    'examples/package/prettier.config.cjs',
  ],
});
