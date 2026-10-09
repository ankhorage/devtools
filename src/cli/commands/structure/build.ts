import type { DevtoolsProviderCommandContext } from '../../../types/provider-command.js';
import { runStructureGenerationCommandAsync } from './runStructureGenerationCommandAsync.js';

/*** Adapt the public structure build command to deterministic owner artifact generation. */
export async function build(
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  return runStructureGenerationCommandAsync('build', argv, context);
}
