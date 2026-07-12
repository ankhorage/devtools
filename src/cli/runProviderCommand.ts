import type { DevtoolsCommandDefinition } from './commands.js';
import { runExternalTool } from './runExternalTool.js';
import {
  runRepositoryCommand,
  type DevtoolsRepositoryCommandContext,
} from './runRepositoryCommand.js';

export interface DevtoolsProviderCommandContext extends DevtoolsRepositoryCommandContext {
  readonly env: Readonly<Record<string, string | undefined>>;
}

export async function runProviderCommand(
  command: DevtoolsCommandDefinition,
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  if (command.kind === 'external') {
    return await runExternalTool(command, argv, {
      cwd: context.cwd,
      env: { ...context.env },
    });
  }

  return await runRepositoryCommand(command, argv, context);
}
