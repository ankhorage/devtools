import { readFile } from 'node:fs/promises';

import { bunRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileDefinition } from '../shared/managedFiles.js';

const BUN_VERSION_TOKEN = '__ANKH_BUN_VERSION__';

export const workflowManagedFiles = [
  createWorkflowDefinition('.github/workflows/ci.yml', './files/ci.yml'),
  createWorkflowDefinition('.github/workflows/release.yml', './files/release.yml'),
] as const satisfies readonly ManagedFileDefinition[];

function createWorkflowDefinition(relativePath: string, sourcePath: string): ManagedFileDefinition {
  const sourceUrl = new URL(sourcePath, import.meta.url);
  return {
    relativePath,
    render: async () => {
      const template = await readFile(sourceUrl, 'utf8');
      return template.replaceAll(BUN_VERSION_TOKEN, bunRuntimePolicy.version);
    },
  };
}
