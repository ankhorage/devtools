import type { ManagedFileDefinition } from '../shared/managedFiles.js';

export const workflowManagedFiles = [
  {
    relativePath: '.github/workflows/ci.yml',
    sourceUrl: new URL('./files/ci.yml', import.meta.url),
  },
  {
    relativePath: '.github/workflows/release.yml',
    sourceUrl: new URL('./files/release.yml', import.meta.url),
  },
] as const satisfies readonly ManagedFileDefinition[];
