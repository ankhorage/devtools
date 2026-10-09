import type { DevtoolsProviderCommandContext } from '../../../types/provider-command.js';
import { runApmReleaseCommandAsync } from './runApmReleaseCommandAsync.js';

/*** Adapt the public APM release validate command to the shared release boundary. */
export async function validate(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runApmReleaseCommandAsync('validate', argv, context);
}
