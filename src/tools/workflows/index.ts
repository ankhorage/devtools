import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';

import { resolveApmReleaseCommandAsync } from '../../features/apm-release-validation/adapters/outbound/resolveApmReleaseCommandAsync.js';
import { resolveStructureReleaseCommandAsync } from '../../features/structure-descriptor-generation/adapters/outbound/resolveStructureReleaseCommandAsync.js';
import { DEVTOOLS_BUN_RUNTIME_POLICY } from '../../policy/bunRuntimePolicy.js';
import { resolvePkgvizAuditPolicyAsync } from '../../policy/resolvePkgvizAuditPolicyAsync.js';
import type { ManagedFileDefinition } from '../shared/managedFiles.js';
import { readCurrentDoctorVersion } from './readCurrentDoctorVersion.js';
import { renderRenovateConfigAsync } from './renderRenovateConfigAsync.js';
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
    render: renderRenovateConfigAsync,
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
        bunVersion: DEVTOOLS_BUN_RUNTIME_POLICY.version,
        doctorVersion: readCurrentDoctorVersion(),
        nodeVersion: REPOSITORY_POLICY.runtime.node.setupVersion,
        pkgvizAudit: await resolvePkgvizAuditPolicyAsync(targetDirectory),
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
        bunVersion: DEVTOOLS_BUN_RUNTIME_POLICY.version,
        doctorVersion: readCurrentDoctorVersion(),
        nodeVersion: REPOSITORY_POLICY.runtime.node.setupVersion,
      }),
  };
}
