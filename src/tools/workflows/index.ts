import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileDefinition } from '../shared/managedFiles.js';
import { renderRenovateWorkflowAsync } from './renderRenovateWorkflowAsync.js';
import { renderWorkflowAsync } from './renderWorkflowAsync.js';

export const workflowManagedFiles = [
  createWorkflowDefinition('.github/workflows/ci.yml', './files/ci.yml'),
  createWorkflowDefinition('.github/workflows/release.yml', './files/release.yml'),
  createRenovateWorkflowDefinition(),
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

/*** Creates the managed workflow whose immutable digest remains Renovate-owned. */
function createRenovateWorkflowDefinition(): ManagedFileDefinition {
  const sourceUrl = new URL('./files/renovate.yml', import.meta.url);
  return {
    relativePath: '.github/workflows/renovate.yml',
    render: async (targetDirectory) =>
      await renderRenovateWorkflowAsync(sourceUrl, targetDirectory, {
        bunVersion: bunRuntimePolicy.version,
        nodeVersion: nodeRuntimePolicy.setupVersion,
      }),
  };
}
