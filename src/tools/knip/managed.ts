import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';

/*** Create the shared Knip starter with entrypoints appropriate to the selected package profile. */
export function getKnipManagedFiles(standaloneBootstrap = false): readonly ManagedFileDefinition[] {
  const options = standaloneBootstrap
    ? `{
  entry: ['src/index.ts', 'eslint.config.mjs', '.prettierrc.js', 'paradox.config.ts'],
}`
    : '';
  return [
    {
      relativePath: 'knip.config.ts',
      mode: 'create-only',
      contents: `import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig(${options});
`,
    },
  ];
}
