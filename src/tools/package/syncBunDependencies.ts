import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

import type { ManagedFileSyncResult } from '../shared/managedFiles.js';

export async function syncBunDependencies(
  targetDirectory: string,
): Promise<ManagedFileSyncResult> {
  const lockfilePath = resolve(targetDirectory, 'bun.lock');
  const existed = existsSync(lockfilePath);

  await runBunInstall(targetDirectory);

  return {
    relativePath: 'bun.lock',
    action: existed ? 'updated' : 'created',
  };
}

async function runBunInstall(targetDirectory: string): Promise<void> {
  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('bun', ['install'], { cwd: targetDirectory, stdio: 'inherit' });
    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`bun install exited with code ${code ?? 'unknown'}.`));
    });
  });
}
