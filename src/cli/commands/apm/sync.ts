import type { DevtoolsProviderCommandContext } from '../../../types/provider-command.js';
import { runApmReleaseCommandAsync } from './runApmReleaseCommandAsync.js';

/*** Adapt the public APM release sync command to the shared release boundary. */
export async function sync(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runApmReleaseCommandAsync('sync', argv, context);
}
