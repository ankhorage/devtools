import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';

import type { DevtoolsCommandDefinition, DevtoolsToolName } from './devtoolsCommands.js';

const require = createRequire(import.meta.url);

export type { DevtoolsCommandDefinition, DevtoolsToolName };

export interface DevtoolsRunResult {
  exitCode: number;
}

interface DevtoolsRunnerOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

interface ResolvedExecutionTarget {
  command: string;
  args: readonly string[];
  shell: boolean;
}

interface SpawnedProcess {
  on(event: 'error', listener: (error: Error) => void): SpawnedProcess;
  on(
    event: 'exit',
    listener: (code: number | null, signal: NodeJS.Signals | null) => void,
  ): SpawnedProcess;
}

type SpawnProcess = (
  command: string,
  args: readonly string[],
  options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    shell: boolean;
    stdio: 'inherit';
  },
) => SpawnedProcess;

interface DevtoolsRunnerDependencies {
  readonly logError: (message: string) => void;
  readonly resolveExecutionTarget: (
    command: DevtoolsCommandDefinition,
  ) => Promise<ResolvedExecutionTarget>;
  readonly spawnProcess: SpawnProcess;
}

const defaultRunnerDependencies: DevtoolsRunnerDependencies = {
  logError: (message) => {
    console.error(message);
  },
  resolveExecutionTarget,
  spawnProcess: (command, args, options) => spawn(command, args, options),
};

export async function runDevtoolsCommand(
  command: DevtoolsCommandDefinition,
  argv: readonly string[],
  options?: DevtoolsRunnerOptions,
): Promise<DevtoolsRunResult> {
  return runDevtoolsCommandWithDependencies(command, argv, options, defaultRunnerDependencies);
}

export async function runDevtoolsCommandWithDependencies(
  command: DevtoolsCommandDefinition,
  argv: readonly string[],
  options: DevtoolsRunnerOptions | undefined,
  dependencies: DevtoolsRunnerDependencies,
): Promise<DevtoolsRunResult> {
  let executionTarget: ResolvedExecutionTarget;

  try {
    executionTarget = await dependencies.resolveExecutionTarget(command);
  } catch (error) {
    dependencies.logError(`Failed to resolve ${command.binName}: ${getErrorMessage(error)}`);

    return { exitCode: 1 };
  }

  const cwd = options?.cwd ?? process.cwd();
  const env = options?.env ?? process.env;

  return await new Promise<DevtoolsRunResult>((resolveResult) => {
    let settled = false;

    const settle = (result: DevtoolsRunResult) => {
      if (settled) {
        return;
      }

      settled = true;
      resolveResult(result);
    };

    const child = dependencies.spawnProcess(
      executionTarget.command,
      [...executionTarget.args, ...argv],
      {
        cwd,
        env,
        shell: executionTarget.shell,
        stdio: 'inherit',
      },
    );

    child.on('error', (error) => {
      dependencies.logError(`Failed to start ${command.binName}: ${getErrorMessage(error)}`);
      settle({ exitCode: 1 });
    });

    child.on('exit', (code, signal) => {
      if (signal !== null) {
        dependencies.logError(`${command.binName} exited with signal ${signal}.`);
        settle({ exitCode: 1 });
        return;
      }

      settle({ exitCode: code ?? 1 });
    });
  });
}

async function resolveExecutionTarget(
  command: DevtoolsCommandDefinition,
): Promise<ResolvedExecutionTarget> {
  const binPath = await readPackageBinPath(command.packageName, command.binName);
  if (await shouldExecuteWithNode(binPath)) {
    return {
      command: process.execPath,
      args: [binPath],
      shell: false,
    };
  }

  return {
    command: binPath,
    args: [],
    shell: process.platform === 'win32',
  };
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

async function readPackageBinPath(packageName: string, binName: string): Promise<string> {
  const packageJsonPath = findPackageJsonPath(packageName);
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as unknown;

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

async function shouldExecuteWithNode(binPath: string): Promise<boolean> {
  const extension = extname(binPath).toLowerCase();
  if (extension === '.cjs' || extension === '.js' || extension === '.mjs') {
    return true;
  }

  const firstLine = (await readFile(binPath, 'utf8')).split('\n', 1)[0] ?? '';
  return firstLine.startsWith('#!') && firstLine.includes('node');
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
