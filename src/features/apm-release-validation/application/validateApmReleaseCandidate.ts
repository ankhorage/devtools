import { createHash } from 'node:crypto';

import {
  validatePackageUpdateMetadata,
  validateUpdateDescriptor,
  validateUpdateExtensionBinding,
  validateUpdateExtensionCapabilities,
} from '@ankhorage/apm';
import type { ApmExtensionArtifactIdentity } from '@ankhorage/apm/types';
import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

import type {
  ApmPackedReleaseCandidate,
  ApmReleaseValidationResult,
} from '../../../types/apm-release-validation';

/*** Validate one exact packed package candidate through the canonical public APM protocol validators. */
export function validateApmReleaseCandidate(
  candidate: ApmPackedReleaseCandidate,
): ApmReleaseValidationResult {
  const identity = packageIdentity(candidate.packageJson);
  const metadata = packageApmMetadata(candidate.packageJson);
  if (metadata === undefined) {
    return {
      applicable: false,
      valid: true,
      ...(identity.name === undefined ? {} : { packageName: identity.name }),
      ...(identity.version === undefined ? {} : { packageVersion: identity.version }),
      blockers: [],
    };
  }

  const metadataValidation = validatePackageUpdateMetadata(metadata);
  if (!metadataValidation.valid || identity.name === undefined || identity.version === undefined) {
    return result(identity, protocolBlockers(metadataValidation.blockers, identity));
  }

  const descriptorValidation = validateUpdateDescriptor({
    descriptor: candidate.descriptor,
    expectedOwner: { name: identity.name, version: identity.version },
  });
  if (!descriptorValidation.valid || descriptorValidation.descriptor === undefined) {
    return result(identity, protocolBlockers(descriptorValidation.blockers, identity));
  }

  const descriptor = descriptorValidation.descriptor;
  if (descriptor.extension === undefined) return result(identity, []);
  if (candidate.extension === undefined) {
    return result(identity, [
      `protocol.extension-binding-mismatch: Packed candidate does not expose executable extension ${descriptor.extension.export}.`,
    ]);
  }

  const artifact: ApmExtensionArtifactIdentity = {
    role: 'target',
    packageName: identity.name,
    version: identity.version,
    integrity: candidate.integrity,
    descriptorDigest: sha256(candidate.descriptorSource),
  };
  return result(identity, [
    ...protocolBlockers(validateUpdateExtensionBinding(artifact, candidate.extension), identity),
    ...protocolBlockers(
      validateUpdateExtensionCapabilities(descriptor, artifact, candidate.extension),
      identity,
    ),
  ]);
}

/*** Read package identity fields without assuming candidate JSON shape. */
function packageIdentity(packageJson: Readonly<Record<string, unknown>>): {
  readonly name?: string;
  readonly version?: string;
} {
  const name = readOwnProperty(packageJson, 'name');
  const version = readOwnProperty(packageJson, 'version');
  return {
    ...(typeof name === 'string' && name.trim() !== '' ? { name } : {}),
    ...(typeof version === 'string' && version.trim() !== '' ? { version } : {}),
  };
}

/*** Read opt-in APM metadata from the package's existing `ankh` namespace. */
function packageApmMetadata(packageJson: Readonly<Record<string, unknown>>): unknown {
  const ankh = readOwnProperty(packageJson, 'ankh');
  return isRecord(ankh) ? readOwnProperty(ankh, 'apm') : undefined;
}

/*** Build the stable validation result around one candidate package identity. */
function result(
  identity: { readonly name?: string; readonly version?: string },
  blockers: readonly string[],
): ApmReleaseValidationResult {
  return {
    applicable: true,
    valid: blockers.length === 0,
    ...(identity.name === undefined ? {} : { packageName: identity.name }),
    ...(identity.version === undefined ? {} : { packageVersion: identity.version }),
    blockers,
  };
}

/*** Render canonical APM blockers into bounded CLI/workflow evidence. */
function protocolBlockers(
  blockers: readonly { readonly code: string; readonly reason: string }[],
  identity: { readonly name?: string; readonly version?: string },
): readonly string[] {
  const missingIdentity = [
    ...(identity.name === undefined ? ['package.identity: Packed candidate has no package name.'] : []),
    ...(identity.version === undefined
      ? ['package.identity: Packed candidate has no exact package version.']
      : []),
  ];
  return [...missingIdentity, ...blockers.map(({ code, reason }) => `${code}: ${reason}`)];
}

/*** Return the descriptor digest format required by APM extension binding. */
function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
