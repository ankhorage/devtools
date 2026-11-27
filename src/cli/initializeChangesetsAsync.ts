import { getDevtoolsToolCommand } from './commands.js';
import { runExternalTool } from './runExternalTool.js';

/*** Run the interactive Changesets initialization only with a usable terminal. */
export async function initializeChangesetsAsync(targetDirectory: string): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Changesets initialization requires a terminal. Run ankh devtools changeset init locally, then repeat sync.',
    );
  }
  const result = await runExternalTool(getDevtoolsToolCommand('changeset'), ['init'], {
    cwd: targetDirectory,
  });
  if (result.exitCode !== 0)
    throw new Error(`Changesets init exited with code ${result.exitCode}.`);
}
