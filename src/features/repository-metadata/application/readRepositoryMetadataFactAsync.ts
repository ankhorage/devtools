import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type {
  RepositoryImplementationRef,
  RepositoryMetadata,
  RepositoryMetadataArchitecture,
  RepositoryMetadataConstraints,
  RepositoryMetadataKind,
} from '@ankhorage/contracts/metadata';
import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { isRecord } from '@ankhorage/utility/object';

export interface RepositoryMetadataFact {
  readonly document: RepositoryMetadata | undefined;
  readonly exists: boolean;
  readonly path: string;
  readonly profile: 'non-source' | 'source';
}

/*** Read canonical repository metadata as inert JSON from the profile-owned local path. */
export async function readRepositoryMetadataFactAsync(
  targetDirectory: string,
): Promise<RepositoryMetadataFact> {
  const profile = (await pathExistsAsync(join(targetDirectory, 'src'))) ? 'source' : 'non-source';
  const path =
    profile === 'source'
      ? REPOSITORY_RULE_METADATA.metadata.profiles.source.canonicalPath
      : REPOSITORY_RULE_METADATA.metadata.profiles.nonSource.canonicalPath;
  const metadataPath = join(targetDirectory, path);
  if (!(await pathExistsAsync(metadataPath))) {
    return { document: undefined, exists: false, path, profile };
  }
  return {
    document: parseRepositoryMetadata(await readFile(metadataPath, 'utf8')),
    exists: true,
    path,
    profile,
  };
}

/*** Decode a complete portable metadata document without executing repository-owned code. */
function parseRepositoryMetadata(text: string): RepositoryMetadata | undefined {
  const parsed = parseJsonDocument(text);
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isMetadataKind(parsed.kind)) {
    return undefined;
  }
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.summary !== 'string' ||
    typeof parsed.purpose !== 'string' ||
    !hasValidOptionalFields(parsed)
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    kind: parsed.kind,
    title: parsed.title,
    summary: parsed.summary,
    purpose: parsed.purpose,
    ...optionalMetadataFields(parsed),
  };
}

/*** Parse authored JSON without leaking parser-specific failures across the metadata boundary. */
function parseJsonDocument(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/*** Reject malformed recognized fields instead of silently discarding authored facts. */
function hasValidOptionalFields(metadata: Record<string, unknown>): boolean {
  return (
    (metadata.domain === undefined || typeof metadata.domain === 'string') &&
    hasOptionalStringArray(metadata.responsibilities) &&
    hasOptionalStringArray(metadata.boundaries) &&
    hasOptionalStringArray(metadata.audience) &&
    hasOptionalStringArray(metadata.useCases) &&
    hasValidArchitecture(metadata.architecture) &&
    hasValidImplementations(metadata.implements) &&
    hasValidConstraints(metadata.constraints)
  );
}

/*** Preserve optional Contract fields after their complete shape has been verified. */
function optionalMetadataFields(
  metadata: Record<string, unknown>,
): Omit<RepositoryMetadata, 'kind' | 'purpose' | 'schemaVersion' | 'summary' | 'title'> {
  return {
    ...(typeof metadata.domain === 'string' ? { domain: metadata.domain } : {}),
    ...optionalTextCollections(metadata),
    ...optionalArchitectureField(metadata.architecture),
    ...optionalImplementsField(metadata.implements),
    ...optionalConstraintsField(metadata.constraints),
  };
}

/*** Read optional authored text collections from a previously validated document. */
function optionalTextCollections(
  metadata: Record<string, unknown>,
): Partial<Pick<RepositoryMetadata, 'audience' | 'boundaries' | 'responsibilities' | 'useCases'>> {
  const responsibilities = readStringArray(metadata.responsibilities);
  const boundaries = readStringArray(metadata.boundaries);
  const audience = readStringArray(metadata.audience);
  const useCases = readStringArray(metadata.useCases);
  return {
    ...(responsibilities === undefined ? {} : { responsibilities }),
    ...(boundaries === undefined ? {} : { boundaries }),
    ...(audience === undefined ? {} : { audience }),
    ...(useCases === undefined ? {} : { useCases }),
  };
}

/*** Read an optional architecture fact from a previously validated document. */
function optionalArchitectureField(
  value: unknown,
): Partial<Pick<RepositoryMetadata, 'architecture'>> {
  if (!isRecord(value)) return {};
  const invariants = readStringArray(value.invariants);
  const architecture: RepositoryMetadataArchitecture = {
    ...(typeof value.role === 'string' ? { role: value.role } : {}),
    ...(invariants === undefined ? {} : { invariants }),
  };
  return Object.keys(architecture).length > 0 ? { architecture } : {};
}

/*** Read implementation references from a previously validated document. */
function optionalImplementsField(value: unknown): Partial<Pick<RepositoryMetadata, 'implements'>> {
  if (!Array.isArray(value)) return {};
  return {
    implements: value.flatMap((reference) => {
      const implementation = parseImplementationReference(reference);
      return implementation === undefined ? [] : [implementation];
    }),
  };
}

/*** Decode one validated portable implementation reference. */
function parseImplementationReference(value: unknown): RepositoryImplementationRef | undefined {
  if (!isRecord(value) || typeof value.packageName !== 'string') return undefined;
  if (value.subpath !== undefined && typeof value.subpath !== 'string') return undefined;
  if (value.interfaceId !== undefined && typeof value.interfaceId !== 'string') return undefined;
  return {
    packageName: value.packageName,
    ...(typeof value.subpath === 'string' ? { subpath: value.subpath } : {}),
    ...(typeof value.interfaceId === 'string' ? { interfaceId: value.interfaceId } : {}),
  };
}

/*** Read optional operational constraints from a previously validated document. */
function optionalConstraintsField(
  value: unknown,
): Partial<Pick<RepositoryMetadata, 'constraints'>> {
  if (!isRecord(value)) return {};
  const constraints: RepositoryMetadataConstraints = {
    ...(readStringArray(value.platforms) === undefined
      ? {}
      : { platforms: readStringArray(value.platforms) }),
    ...(readStringArray(value.configuration) === undefined
      ? {}
      : { configuration: readStringArray(value.configuration) }),
    ...(readStringArray(value.security) === undefined
      ? {}
      : { security: readStringArray(value.security) }),
    ...(readStringArray(value.limitations) === undefined
      ? {}
      : { limitations: readStringArray(value.limitations) }),
  };
  return Object.keys(constraints).length > 0 ? { constraints } : {};
}

/*** Check whether an optional value is absent or a complete Contract-compatible string array. */
function hasOptionalStringArray(value: unknown): boolean {
  return value === undefined || readStringArray(value) !== undefined;
}

/*** Check an optional architecture field without accepting malformed child values. */
function hasValidArchitecture(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      (value.role === undefined || typeof value.role === 'string') &&
      hasOptionalStringArray(value.invariants))
  );
}

/*** Check optional implementation references without losing malformed entries. */
function hasValidImplementations(value: unknown): boolean {
  return (
    value === undefined ||
    (Array.isArray(value) &&
      value.every((reference) => parseImplementationReference(reference) !== undefined))
  );
}

/*** Check optional constraint fields without accepting malformed child values. */
function hasValidConstraints(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      hasOptionalStringArray(value.platforms) &&
      hasOptionalStringArray(value.configuration) &&
      hasOptionalStringArray(value.security) &&
      hasOptionalStringArray(value.limitations))
  );
}

/*** Read one Contract-compatible string-array shape from authored JSON. */
function readStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value
    : undefined;
}

/*** Recognize the portable Contract's closed metadata-kind vocabulary. */
function isMetadataKind(value: unknown): value is RepositoryMetadataKind {
  return (
    typeof value === 'string' &&
    [
      'adapter',
      'application',
      'configuration',
      'contract',
      'infrastructure',
      'library',
      'tooling',
      'website',
    ].includes(value)
  );
}

/*** Test one local path without shelling out or consulting external state. */
async function pathExistsAsync(path: string): Promise<boolean> {
  return await access(path).then(
    () => true,
    () => false,
  );
}
