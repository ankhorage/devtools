import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

/*** Use Devtools' built structure CLI for self-release and the installed binary in consumers. */
export async function resolveStructureReleaseCommandAsync(
  targetDirectory: string,
): Promise<string> {
  try {
    const packageJson = JSON.parse(
      await readFile(resolve(targetDirectory, 'package.json'), 'utf8'),
    ) as unknown;
    return isPackageNamed(packageJson, '@ankhorage/devtools') ? SELF_COMMAND : CONSUMER_COMMAND;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return CONSUMER_COMMAND;
    }
    throw error;
  }
}

/*** Narrow a package manifest by its canonical package name. */
function isPackageNamed(value: unknown, expectedName: string): boolean {
  return (
    typeof value === 'object' && value !== null && 'name' in value && value.name === expectedName
  );
}

const SELF_COMMAND = 'node ./dist/cli/bin/structure.js';
const CONSUMER_COMMAND = './node_modules/.bin/ankhorage-structure';
