import type { ApmUpdateExtension } from '@ankhorage/apm/types';

/*** Packed package evidence consumed by the APM release validation use case. */
export interface ApmPackedReleaseCandidate {
  readonly packageJson: Readonly<Record<string, unknown>>;
  readonly descriptor: unknown;
  readonly descriptorSource: string;
  readonly integrity: string;
  readonly extension?: ApmUpdateExtension;
}

/*** Structured package release validation result used by CLI and workflow adapters. */
export interface ApmReleaseValidationResult {
  readonly applicable: boolean;
  readonly valid: boolean;
  readonly packageName?: string;
  readonly packageVersion?: string;
  readonly blockers: readonly string[];
}
