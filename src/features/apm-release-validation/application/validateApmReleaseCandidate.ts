import { createHash } from 'node:crypto';

import {
  validatePackageUpdateMetadata,
  validateUpdateDescriptor,
  validateUpdateExtensionBinding,
  validateUpdateExtensionCapabilities,
} from '@ankhorage/apm';
import type {
  ApmExtensionArtifactIdentity,
  ApmUpdateDescriptor,
  ApmUpdateExtension,
} from '@ankhorage/apm/types';

import type {
  ApmPackedReleaseCandidate,
  ApmReleaseValidationOptions,
  ApmReleaseValidationResult,
} from '../../../types/apm-release-validation.js';
import { readApmReleaseMetadata } from '../utils/readApmReleaseMetadata.js';

/*** Validate packed owner evidence using the released APM protocol, never a copied schema.
 * Opt-in packages declare ankh.apm with protocolVersion and a package-relative descriptor.
 * No metadata means not applicable, not a claim that no migration is needed. The descriptor
 * declares supported no-migration, required migration, or unsupported/manual history explicitly.
 * Previous descriptors enforce immutable migration checksums and related descriptors validate
 * cross-owner prerequisites. Package-owned source-to-target tests must also cover skipped versions,
 * idempotency, interruption/recovery, and unsupported historical states.
 * @readme
 */
export function validateApmReleaseCandidate(
  candidate: ApmPackedReleaseCandidate,
  options: ApmReleaseValidationOptions = {},
): ApmReleaseValidationResult {
  const { name, version } = candidate.packageJson;
  const identity = {
    ...(typeof name === 'string' ? { packageName: name } : {}),
    ...(typeof version === 'string' ? { packageVersion: version } : {}),
    integrity: candidate.integrity,
  };
  const metadata = readApmReleaseMetadata(candidate.packageJson);
  const integrityBlockers =
    options.expectedIntegrity !== undefined && options.expectedIntegrity !== candidate.integrity
      ? ['release.integrity-mismatch: Packed bytes differ from the selected release artifact.']
      : [];
  if (metadata === undefined) {
    return {
      ...identity,
      applicable: false,
      valid: integrityBlockers.length === 0,
      blockers: integrityBlockers,
    };
  }
  const metadataValidation = validatePackageUpdateMetadata(metadata);
  if (typeof name !== 'string' || !name || typeof version !== 'string' || !version) {
    return result(identity, ['release.identity: Package must define name and exact version.']);
  }
  if (!metadataValidation.valid)
    return result(identity, [...integrityBlockers, ...messages(metadataValidation.blockers)]);
  const validation = validateUpdateDescriptor({
    descriptor: candidate.descriptor,
    expectedOwner: { name, version },
    previousDescriptors: options.previousDescriptors,
    relatedDescriptors: options.relatedDescriptors,
  });
  if (!validation.valid || validation.descriptor === undefined || integrityBlockers.length > 0) {
    return result(identity, [...integrityBlockers, ...messages(validation.blockers)]);
  }
  return result(identity, extensionBlockers(candidate, validation.descriptor));
}

/*** Validate executable binding and required handlers after static metadata has passed. */
function extensionBlockers(
  candidate: ApmPackedReleaseCandidate,
  descriptor: ApmUpdateDescriptor,
): readonly string[] {
  if (descriptor.extension === undefined) return [];
  const artifact: ApmExtensionArtifactIdentity = {
    role: 'target',
    packageName: descriptor.owner.name,
    version: descriptor.owner.version,
    integrity: candidate.integrity,
    descriptorDigest: createHash('sha256').update(candidate.descriptorSource).digest('hex'),
  };
  if (!isBoundExtension(artifact, candidate.extension)) {
    return messages(validateUpdateExtensionBinding(artifact, candidate.extension));
  }
  return messages(validateUpdateExtensionCapabilities(descriptor, artifact, candidate.extension));
}

/*** Narrow unknown executable evidence only after the canonical runtime validator accepts it. */
function isBoundExtension(
  artifact: ApmExtensionArtifactIdentity,
  value: unknown,
): value is ApmUpdateExtension {
  return validateUpdateExtensionBinding(artifact, value).length === 0;
}

/*** Preserve structured candidate identity and canonical blocker reasons. */
function result(
  identity: Pick<ApmReleaseValidationResult, 'packageName' | 'packageVersion' | 'integrity'>,
  blockers: readonly string[],
): ApmReleaseValidationResult {
  return { ...identity, applicable: true, valid: blockers.length === 0, blockers };
}

/*** Render the protocol's own diagnostics without reinterpreting their semantics. */
function messages(
  blockers: readonly { readonly code: string; readonly reason: string }[],
): readonly string[] {
  return blockers.map(({ code, reason }) => `${code}: ${reason}`);
}
