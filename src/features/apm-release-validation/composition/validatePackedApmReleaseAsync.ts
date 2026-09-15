import type {
  ApmReleaseValidationOptions,
  ApmReleaseValidationResult,
} from '../../../types/apm-release-validation.js';
import { inspectPackedApmReleaseCandidateAsync } from '../adapters/outbound/inspectPackedApmReleaseCandidateAsync.js';

/*** Validate script-free publish bytes and optionally retain that exact accepted archive.
 * Release order is APM protocol, package-owner metadata/code, then consuming applications.
 * Build after Changesets versioning and descriptor synchronization. Execute package-owned
 * acceptance tests, then validate with explicit owner-code consent. The child probe uses the
 * packed package's native public export resolution and installed dependencies, not omitted source.
 * Consent permits trusted executable code; a child process is not a security sandbox.
 * An artifactPath retains accepted bytes exclusively, so publication need not repack or rerun
 * lifecycle scripts. expectedIntegrity rejects a stale candidate before any owner code loads.
 * @readme
 */
export async function validatePackedApmReleaseAsync(
  targetDirectory: string,
  options: ApmReleaseValidationOptions = {},
): Promise<ApmReleaseValidationResult> {
  return inspectPackedApmReleaseCandidateAsync(targetDirectory, options);
}
