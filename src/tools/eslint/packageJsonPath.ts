import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import type { DevtoolsConfigOptions } from './types.js';

export function resolveProjectPackageJsonPath(options: DevtoolsConfigOptions): string | null {
  if (options.packageJsonPath !== undefined) {
    return resolve(options.tsconfigRootDir, options.packageJsonPath);
  }

  let directory = resolve(options.tsconfigRootDir);
  for (;;) {
    const candidate = resolve(directory, 'package.json');
    if (existsSync(candidate)) return candidate;

    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}
