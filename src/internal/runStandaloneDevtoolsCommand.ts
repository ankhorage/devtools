import { getDevtoolsCommand } from './devtoolsCommands.js';
import type { DevtoolsToolName } from './runDevtoolsCommand.js';
import { type DevtoolsRunResult, runDevtoolsCommand } from './runDevtoolsCommand.js';

export async function runStandaloneDevtoolsCommand(
  toolName: DevtoolsToolName,
  argv: readonly string[],
): Promise<DevtoolsRunResult> {
  return runDevtoolsCommand(getDevtoolsCommand(toolName), argv);
}
