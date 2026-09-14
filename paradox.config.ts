import { readFileSync } from 'node:fs';

import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    usage: { description: readFileSync(new URL('./src/cli/usage.md', import.meta.url), 'utf8') },
  },
  package: {
    root: '.',
    entrypoints: ['src/cli/index.ts', 'src/tools/eslint/index.ts', 'src/tools/knip/index.ts'],
  },
  output: { dir: './paradox' },
});
