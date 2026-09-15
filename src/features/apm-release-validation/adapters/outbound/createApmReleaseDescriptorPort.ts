import { readFile, realpath, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

import { resolvePathWithinRoot } from '@ankhorage/utility/node/path';
import { format } from 'prettier';

import type { ApmReleaseDescriptorPort } from '../../../../types/apm-release-validation.js';
import { readApmReleaseManifestAsync } from './readApmReleaseManifestAsync.js';

/*** Supply bounded owner-document reads and idempotent writes for release synchronization. */
export function createApmReleaseDescriptorPort(targetDirectory: string): ApmReleaseDescriptorPort {
  return {
    readPackageAsync: () => readApmReleaseManifestAsync(resolve(targetDirectory, 'package.json')),
    readDescriptorAsync: async (subpath) =>
      readApmReleaseManifestAsync(await descriptorPathAsync(targetDirectory, subpath)),
    writeDescriptorAsync: async (subpath, descriptor) => {
      const path = await descriptorPathAsync(targetDirectory, subpath);
      const before = await readFile(path, 'utf8');
      const after = await format(JSON.stringify(descriptor), {
        parser: 'json',
        printWidth: 100,
        tabWidth: 2,
      });
      if (before === after) return false;
      await writeFile(path, after, 'utf8');
      return true;
    },
  };
}

/*** Prevent descriptor reads and writes from following paths or symlinks outside the owner root. */
async function descriptorPathAsync(target: string, subpath: string): Promise<string> {
  const root = await realpath(target);
  const resolved = await realpath(resolvePathWithinRoot(root, subpath));
  return resolvePathWithinRoot(root, relative(root, resolved));
}
