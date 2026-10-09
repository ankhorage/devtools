/*** Materialize the trusted canonical capability surface for one package checkout. */
import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { isCapability, normalizeCapability } from '@ankhorage/capability';
import type { Capability } from '@ankhorage/contracts/capability';

const CAPABILITIES_SOURCE_PATH = 'src/capabilities/index.ts';

/*** Resolve, validate, and normalize one opted-in package's canonical capability catalog. */
export async function resolvePackageCapabilitiesAsync(
  targetDirectory: string,
  manifest: Readonly<Record<string, unknown>>,
): Promise<readonly Capability[] | undefined> {
  const sourcePath = resolve(targetDirectory, CAPABILITIES_SOURCE_PATH);
  try {
    await access(sourcePath);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      if (!hasCapabilityMetadata(manifest)) return undefined;
      throw new Error(
        `package.json ankh.capabilities requires the canonical ${CAPABILITIES_SOURCE_PATH} capability surface.`,
        { cause: error },
      );
    }
    throw error;
  }

  if (!isRecord(manifest.ankh)) {
    throw new Error(
      `${CAPABILITIES_SOURCE_PATH} requires package.json ankh discovery metadata for publication.`,
    );
  }

  const source: unknown = await import(pathToFileURL(sourcePath).href);
  const catalog = isRecord(source) ? source.CAPABILITIES : undefined;
  if (!Array.isArray(catalog)) {
    throw new Error(`${CAPABILITIES_SOURCE_PATH} must export CAPABILITIES as an array.`);
  }

  const capabilities = catalog.map((capability, index) => {
    if (!isCapability(capability)) {
      throw new Error(
        `${CAPABILITIES_SOURCE_PATH} CAPABILITIES[${index}] is not a valid Capability.`,
      );
    }
    return normalizeCapability(capability);
  });
  assertUniqueCapabilityIds(capabilities);
  return capabilities;
}

/*** Check whether a manifest declares published capability discovery metadata. */
function hasCapabilityMetadata(manifest: Readonly<Record<string, unknown>>): boolean {
  return isRecord(manifest.ankh) && Object.hasOwn(manifest.ankh, 'capabilities');
}

/*** Reject duplicate identifiers before serializing a catalog into static package metadata. */
function assertUniqueCapabilityIds(capabilities: readonly Capability[]): void {
  const ids = new Set<string>();
  for (const capability of capabilities) {
    if (ids.has(capability.id)) {
      throw new Error(`Duplicate capability id "${capability.id}" in ${CAPABILITIES_SOURCE_PATH}.`);
    }
    ids.add(capability.id);
  }
}

/*** Narrow an unknown value to a JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Narrow an unknown error to a Node error carrying an error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}
