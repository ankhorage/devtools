import type { ManagedDevtoolsCommandDefinition } from './devtoolsCommands.js';
import { runManagedFilesCommand } from '../tools/shared/runManagedFilesCommand.js';
import { vscodeFiles } from '../tools/vscode/index.js';
import { workflowFiles } from '../tools/workflows/index.js';

export interface ManagedDevtoolsCommandContext {
  readonly cwd: string;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

export function runManagedDevtoolsCommand(
  command: ManagedDevtoolsCommandDefinition,
  argv: readonly string[],
  context: ManagedDevtoolsCommandContext,
): Promise<{ readonly exitCode: number }> {
  const files =
    command.concern === 'workflows'
      ? workflowFiles
      : command.concern === 'vscode'
        ? vscodeFiles
        : [...workflowFiles, ...vscodeFiles];

  return runManagedFilesCommand(command.mode, files, argv, context);
}
