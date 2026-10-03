import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

type BunCommandRunner = (args: readonly string[], targetDirectory: string) => Promise<void>;

/*** Refresh every Ankhorage package in a Bun lock within declared ranges without changing manifest ownership. */
export async function refreshAnkhorageBunResolutionsAsync(
  targetDirectory: string,
  runCommand: BunCommandRunner = runBunCommandAsync,
): Promise<void> {
  const packagePath = resolve(targetDirectory, 'package.json');
  const manifest = await readFile(packagePath, 'utf8');

  await runCommand(['install', '--lockfile-only', '--ignore-scripts'], targetDirectory);
  try {
    await runCommand(
      ['update', '@ankhorage/*', '--lockfile-only', '--ignore-scripts'],
      targetDirectory,
    );
  } finally {
    await writeFile(packagePath, manifest, 'utf8');
  }

  await runCommand(['install', '--lockfile-only', '--ignore-scripts'], targetDirectory);
}

/*** Execute one Bun package-manager command with inherited output and exact exit handling. */
async function runBunCommandAsync(args: readonly string[], targetDirectory: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('bun', [...args], { cwd: targetDirectory, stdio: 'inherit' });
    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`bun ${args.join(' ')} exited with code ${code ?? 'unknown'}.`));
    });
  });
}
