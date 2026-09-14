import { readFileSync } from 'node:fs';

import { defineParadoxConfig } from '@ankhorage/paradox';

import { bunRuntimePolicy } from './src/policy/bunRuntimePolicy.js';
import { renderBunPolicyDocumentation } from './src/policy/renderBunPolicyDocumentation.js';

export default defineParadoxConfig({
  mode: 'write',
  docs: {
    usage: {
      description: renderBunPolicyDocumentation(
        readFileSync(new URL('./src/cli/usage.md', import.meta.url), 'utf8'),
        bunRuntimePolicy,
      ),
    },
  },
  package: {
    root: '.',
    entrypoints: ['src/cli/index.ts', 'src/tools/eslint/index.ts', 'src/tools/knip/index.ts'],
  },
  output: { dir: './paradox' },
});
