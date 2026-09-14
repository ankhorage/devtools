import { inspectPackedApmReleaseCandidateAsync } from '../adapters/outbound/inspectPackedApmReleaseCandidateAsync';
import { validateApmReleaseCandidate } from '../application/validateApmReleaseCandidate';

/*** Validate the exact package tarball that would be published from one repository root. */
export async function validatePackedApmReleaseAsync(targetDirectory: string) {
  return validateApmReleaseCandidate(await inspectPackedApmReleaseCandidateAsync(targetDirectory));
}
