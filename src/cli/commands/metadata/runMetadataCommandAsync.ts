import { runRepositoryMetadataCommandAsync } from '../../../features/repository-metadata/application/runRepositoryMetadataCommandAsync.js';
import type { DevtoolsRepositoryCommandContext } from '../../../types/provider-command.js';

/*** Adapt the public metadata CLI command to the repository-metadata application boundary. */
export async function runMetadataCommandAsync(
  operation: 'init' | 'status',
  argv: readonly string[],
  context: DevtoolsRepositoryCommandContext,
): Promise<{ readonly exitCode: number }> {
  return await runRepositoryMetadataCommandAsync(operation, argv, context);
}
