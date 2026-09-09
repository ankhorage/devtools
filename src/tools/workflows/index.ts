import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileDefinition } from '../shared/managedFiles.js';
import { renderRenovateWorkflowAsync } from './renderRenovateWorkflowAsync.js';
import { renderWorkflowAsync } from './renderWorkflowAsync.js';

export const workflowManagedFiles: readonly ManagedFileDefinition[] = [
  createWorkflowDefinition('.github/workflows/ci.yml', './files/ci.yml'),
  {
    ...createWorkflowDefinition('.github/workflows/release.yml', './files/release.yml'),
    isApplicable: async (targetDirectory) => {
      try {
        await access(join(targetDirectory, '.changeset/config.json'));
        return true;
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
        throw error;
      }
    },
  },
  createRenovateWorkflowDefinition(),
  {
    relativePath: 'renovate.json5',
    sourceUrl: new URL('./files/renovate.json5', import.meta.url),
    mode: 'create-only',
  },
];

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
