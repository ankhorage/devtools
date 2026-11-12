import { access } from 'node:fs/promises';
import { join } from 'node:path';

import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';

import { resolveApmReleaseCommandAsync } from '../../features/apm-release-validation/adapters/outbound/resolveApmReleaseCommandAsync.js';
import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';
import { resolveStructureReleaseCommandAsync } from '../../features/structure-descriptor-generation/adapters/outbound/resolveStructureReleaseCommandAsync.js';
import { resolveAtlasAuditPolicyAsync } from '../../policy/resolveAtlasAuditPolicyAsync.js';
import { readCurrentDoctorVersion } from './readCurrentDoctorVersion.js';
import {
  hasGitHubArtifactReleaseDescriptorAsync,
  readGitHubArtifactReleaseDescriptorAsync,
} from './readGitHubArtifactReleaseDescriptorAsync.js';
import { renderRenovateConfigAsync } from './renderRenovateConfigAsync.js';
import { renderRenovateWorkflowAsync } from './renderRenovateWorkflowAsync.js';
import { renderWorkflowAsync } from './renderWorkflowAsync.js';

export const workflowManagedFiles: readonly ManagedFileDefinition[] = [
  createWorkflowDefinition('.github/workflows/ci.yml', './files/ci.yml'),
  createReleaseWorkflowDefinition(),
  createRenovateWorkflowDefinition(),
  {
    relativePath: '.github/scripts/ci-impact.ts',
    sourceUrl: new URL('./files/ci-impact.ts', import.meta.url),
  },
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
        bunVersion: REPOSITORY_RULE_METADATA.runtime.bun.version,
        doctorVersion: readCurrentDoctorVersion(),
        nodeVersion: REPOSITORY_RULE_METADATA.runtime.node.setupVersion,
        atlasAudit: await resolveAtlasAuditPolicyAsync(targetDirectory),
      }),
  };
}

/*** Render the legacy npm lane unchanged unless a repository explicitly opts into artifact-only release. */
function createReleaseWorkflowDefinition(): ManagedFileDefinition {
  return {
    relativePath: '.github/workflows/release.yml',
    isApplicable: async (targetDirectory) =>
      (await hasGitHubArtifactReleaseDescriptorAsync(targetDirectory)) ||
      (await hasChangesetsConfigAsync(targetDirectory)),
    render: async (targetDirectory) => {
      const artifactRelease = await readGitHubArtifactReleaseDescriptorAsync(targetDirectory);
      return await renderWorkflowAsync(
        new URL(
          artifactRelease === undefined ? './files/release.yml' : './files/release-artifact.yml',
          import.meta.url,
        ),
        {
          apmReleaseCommand: await resolveApmReleaseCommandAsync(targetDirectory),
          structureReleaseCommand: await resolveStructureReleaseCommandAsync(targetDirectory),
          bunVersion: REPOSITORY_RULE_METADATA.runtime.bun.version,
          doctorVersion: readCurrentDoctorVersion(),
          nodeVersion: REPOSITORY_RULE_METADATA.runtime.node.setupVersion,
          atlasAudit: await resolveAtlasAuditPolicyAsync(targetDirectory),
          artifactRelease,
        },
      );
    },
  };
}

/*** Check the established Changesets opt-in without treating any read failure as absence. */
async function hasChangesetsConfigAsync(targetDirectory: string): Promise<boolean> {
  try {
    await access(join(targetDirectory, '.changeset/config.json'));
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
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
        bunVersion: REPOSITORY_RULE_METADATA.runtime.bun.version,
        doctorVersion: readCurrentDoctorVersion(),
        nodeVersion: REPOSITORY_RULE_METADATA.runtime.node.setupVersion,
      }),
  };
}
