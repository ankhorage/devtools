import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { resolveApmReleaseCommandAsync } from '../../features/apm-release-validation/adapters/outbound/resolveApmReleaseCommandAsync.js';
import { resolveStructureReleaseCommandAsync } from '../../features/structure-descriptor-generation/adapters/outbound/resolveStructureReleaseCommandAsync.js';
import { bunRuntimePolicy, nodeRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import type { ManagedFileDefinition } from '../shared/managedFiles.js';
import { readCurrentDoctorVersion } from './readCurrentDoctorVersion.js';
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

/*** Create a managed workflow definition rendered from current shared runtime policies. */
function createWorkflowDefinition(relativePath: string, sourcePath: string): ManagedFileDefinition {
  const sourceUrl = new URL(sourcePath, import.meta.url);
  return {
    relativePath,
    render: async (targetDirectory) =>
      await renderWorkflowAsync(sourceUrl, {
        apmReleaseCommand: await resolveApmReleaseCommandAsync(targetDirectory),
        structureReleaseCommand: await resolveStructureReleaseCommandAsync(targetDirectory),
        bunVersion: bunRuntimePolicy.version,
        doctorVersion: readCurrentDoctorVersion(),
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
        apmReleaseCommand: await resolveApmReleaseCommandAsync(targetDirectory),
        structureReleaseCommand: await resolveStructureReleaseCommandAsync(targetDirectory),
        bunVersion: bunRuntimePolicy.version,
        doctorVersion: readCurrentDoctorVersion(),
        nodeVersion: nodeRuntimePolicy.setupVersion,
      }),
  };
}
