import { runApmReleaseCommandAsync } from '../../../features/apm-release-validation/adapters/inbound/runApmReleaseCommandAsync.js';
import type { DevtoolsProviderCommandContext } from '../../runProviderCommand.js';

/*** Adapt the public APM release validate command to the shared release boundary. */
export async function validate(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runApmReleaseCommandAsync('validate', argv, context);
}
