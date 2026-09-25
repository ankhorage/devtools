import { runStructureGenerationCommandAsync } from '../../runStructureGenerationCommandAsync.js';
import type { DevtoolsProviderCommandContext } from '../../runProviderCommand.js';

/*** Adapt the public structure build command to deterministic owner artifact generation. */
export async function build(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runStructureGenerationCommandAsync('build', argv, context);
}
