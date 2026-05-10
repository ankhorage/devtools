import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';

const require = createRequire(import.meta.url);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function findPackageJsonPath(packageName: string): string {
  let currentDirectory = dirname(require.resolve(packageName));

  while (currentDirectory !== dirname(currentDirectory)) {
    const packageJsonPath = join(currentDirectory, 'package.json');

    if (existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    currentDirectory = dirname(currentDirectory);
  }

  throw new Error(`Could not find package metadata for ${packageName}.`);
}

function readPackageBinPath(packageName: string, binName: string): string {
  const packageJsonPath = findPackageJsonPath(packageName);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as unknown;

  if (!isRecord(packageJson)) {
    throw new Error(`Package metadata for ${packageName} is not an object.`);
  }

  const { bin } = packageJson;
  let relativeBinPath: string | undefined;

  if (typeof bin === 'string') {
    relativeBinPath = bin;
  } else if (isRecord(bin)) {
    const namedBin = bin[binName];
    if (typeof namedBin === 'string') {
      relativeBinPath = namedBin;
    }
  }

  if (relativeBinPath === undefined) {
    throw new Error(`Package ${packageName} does not expose a ${binName} binary.`);
  }

  return resolve(dirname(packageJsonPath), relativeBinPath);
}

export function runPackageBin(packageName: string, binName: string): void {
  const binPath = readPackageBinPath(packageName, binName);
  const child = spawn(process.execPath, [binPath, ...process.argv.slice(2)], {
    stdio: 'inherit',
  });

  child.on('error', (error) => {
    console.error(error);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (signal !== null) {
      console.error(`${binName} exited with signal ${signal}.`);
      process.exit(1);
    }

    process.exit(code ?? 1);
  });
}
