import { detectProject } from '@ankhorage/project-detector';
import type { ProjectDetectionInput } from '@ankhorage/project-detector/types';

import type { DevtoolsEslintProfile, ResolvedDevtoolsEslintProfile } from './types.js';

/*** Apply Devtools profile precedence to traits from the canonical project detector. */
export function resolveEslintProfileFromDetectionInput(
  requestedProfile: DevtoolsEslintProfile,
  input: ProjectDetectionInput,
): ResolvedDevtoolsEslintProfile {
  if (requestedProfile !== 'auto') return requestedProfile;
  const { traits } = detectProject(input);
  if (traits.has('react-native') || traits.has('expo')) return 'react-native';
  if (traits.has('next')) return 'next';
  return traits.has('react') ? 'react' : 'base';
}
