import { type DevtoolsToolName, getDevtoolsToolCommand } from './commands.js';
import { type DevtoolsRunResult, runExternalTool } from './runExternalTool.js';

export async function runStandaloneTool(
  toolName: DevtoolsToolName,
  argv: readonly string[],
): Promise<DevtoolsRunResult> {
  return await runExternalTool(getDevtoolsToolCommand(toolName), argv);
}
