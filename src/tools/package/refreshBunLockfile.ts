import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

import type { ManagedFileSyncResult } from '../shared/managedFiles.js';

export async function refreshBunLockfile(
  targetDirectory: string,
): Promise<ManagedFileSyncResult> {
  const lockfilePath = resolve(targetDirectory, 'bun.lock');
  const existed = existsSync(lockfilePath);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn('bun', ['install', '--lockfile-only'], {
      cwd: targetDirectory,
      stdio: 'inherit',
    });

    child.once('error', rejectPromise);
    child.once('exit', (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      rejectPromise(new Error(`bun install --lockfile-only exited with code ${code ?? 'unknown'}.`));
    });
  });

  return {
    relativePath: 'bun.lock',
    action: existed ? 'updated' : 'created',
  };
}
