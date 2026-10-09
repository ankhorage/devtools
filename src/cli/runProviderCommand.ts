import type { DevtoolsProviderCommandContext } from '../types/provider-command.js';
import type { DevtoolsCommandDefinition } from './commands.js';
import { sync } from './commands/apm/sync.js';
import { validate } from './commands/apm/validate.js';
import { build } from './commands/structure/build.js';
import { check } from './commands/structure/check.js';
import { runExternalTool } from './runExternalTool.js';
import { runRepositoryCommand } from './runRepositoryCommand.js';

export async function runProviderCommand(
  command: DevtoolsCommandDefinition,
  argv: readonly string[],
  context: DevtoolsProviderCommandContext,
): Promise<{ readonly exitCode: number }> {
  if (command.kind === 'apm-release') {
    return command.operation === 'sync' ? sync(argv, context) : validate(argv, context);
  }
  if (command.kind === 'structure') {
    return command.operation === 'build' ? build(argv, context) : check(argv, context);
  }
  if (command.kind === 'external') {
    return await runExternalTool(command, argv, {
      cwd: context.cwd,
      env: { ...context.env },
    });
  }

  return await runRepositoryCommand(command, argv, context);
}
