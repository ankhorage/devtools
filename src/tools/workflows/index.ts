import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileDefinition } from '../shared/managedFiles.js';
import { renderWorkflowAsync } from './renderWorkflowAsync.js';

export const workflowManagedFiles = [
  createWorkflowDefinition('.github/workflows/ci.yml', './files/ci.yml'),
  createWorkflowDefinition('.github/workflows/release.yml', './files/release.yml'),
  createWorkflowDefinition('.github/workflows/renovate.yml', './files/renovate.yml'),
] as const satisfies readonly ManagedFileDefinition[];

function createWorkflowDefinition(relativePath: string, sourcePath: string): ManagedFileDefinition {
  const sourceUrl = new URL(sourcePath, import.meta.url);
  return {
    relativePath,
    render: async () =>
      await renderWorkflowAsync(sourceUrl, {
        bunVersion: bunRuntimePolicy.version,
        nodeVersion: nodeRuntimePolicy.setupVersion,
      }),
  };
}
