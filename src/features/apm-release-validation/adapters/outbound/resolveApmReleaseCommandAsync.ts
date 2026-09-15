import { resolve } from 'node:path';

import { readApmReleaseManifestAsync } from './readApmReleaseManifestAsync.js';

/*** Use Devtools' own built CLI for self-validation and the installed dependency binary in consumers. */
export async function resolveApmReleaseCommandAsync(targetDirectory: string): Promise<string> {
  try {
    const manifest = await readApmReleaseManifestAsync(resolve(targetDirectory, 'package.json'));
    return manifest.name === '@ankhorage/devtools'
      ? 'node ./dist/cli/bin/apm-release.js'
      : CONSUMER_COMMAND;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return CONSUMER_COMMAND;
    }
    throw error;
  }
}

const CONSUMER_COMMAND = './node_modules/.bin/ankhorage-apm-release';
