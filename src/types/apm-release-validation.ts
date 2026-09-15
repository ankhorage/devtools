import type { ApmUpdateDescriptor } from '@ankhorage/apm/types';

/*** Packed bytes and loaded owner evidence supplied to the canonical APM validators. */
export interface ApmPackedReleaseCandidate {
  readonly packageJson: Readonly<Record<string, unknown>>;
  readonly descriptor: unknown;
  readonly descriptorSource: string;
  readonly integrity: string;
  readonly extension?: unknown;
}

/*** Explicit release-validation inputs; owner code is never trusted by default. */
export interface ApmReleaseValidationOptions {
  readonly allowOwnerCode?: boolean;
  readonly artifactPath?: string;
  readonly expectedIntegrity?: string;
  readonly previousDescriptors?: readonly ApmUpdateDescriptor[];
  readonly relatedDescriptors?: readonly ApmUpdateDescriptor[];
}

/*** Evidence for one exact packed release; inapplicable never means migration-safe. */
export interface ApmReleaseValidationResult {
  readonly applicable: boolean;
  readonly valid: boolean;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly integrity?: string;
  readonly artifactPath?: string;
  readonly blockers: readonly string[];
}

/*** Filesystem capabilities required by descriptor synchronization, independent of transport. */
export interface ApmReleaseDescriptorPort {
  readonly readPackageAsync: () => Promise<Readonly<Record<string, unknown>>>;
  readonly readDescriptorAsync: (subpath: string) => Promise<Readonly<Record<string, unknown>>>;
  readonly writeDescriptorAsync: (
    subpath: string,
    descriptor: Readonly<Record<string, unknown>>,
  ) => Promise<boolean>;
}
