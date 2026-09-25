import { runApmReleaseCommandAsync } from '../../runApmReleaseCommandAsync.js';
import type { DevtoolsProviderCommandContext } from '../../runProviderCommand.js';

/*** Adapt the public APM release sync command to the shared release boundary. */
export async function sync(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runApmReleaseCommandAsync('sync', argv, context);
}
