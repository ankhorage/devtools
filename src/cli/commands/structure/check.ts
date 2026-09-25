import { runStructureGenerationCommandAsync } from '../../runStructureGenerationCommandAsync.js';
import type { DevtoolsProviderCommandContext } from '../../runProviderCommand.js';

/*** Adapt the public structure check command to deterministic owner artifact verification. */
export async function check(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runStructureGenerationCommandAsync('check', argv, context);
}
