import type { ManagedFileDefinition } from '../shared/managedFiles.js';

const KNIP_CONFIG = `import { createKnipConfig } from '@ankhorage/devtools/knip';

export default createKnipConfig();
`;

export const knipManagedFiles = [
  {
    relativePath: 'knip.config.ts',
    contents: KNIP_CONFIG,
    mode: 'create-only',
  },
] as const satisfies readonly ManagedFileDefinition[];
