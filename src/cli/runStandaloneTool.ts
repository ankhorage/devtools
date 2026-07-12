import { getDevtoolsToolCommand, type DevtoolsToolName } from './commands.js';
import { runExternalTool, type DevtoolsRunResult } from './runExternalTool.js';

export async function runStandaloneTool(
  toolName: DevtoolsToolName,
  argv: readonly string[],
): Promise<DevtoolsRunResult> {
  return await runExternalTool(getDevtoolsToolCommand(toolName), argv);
}
