import { resolve } from 'node:path';

import type { ApmReleaseValidationOptions } from '../../../../types/apm-release-validation.js';
import { synchronizeApmReleaseDescriptorAsync } from '../../composition/synchronizeApmReleaseDescriptorAsync.js';
import { validatePackedApmReleaseAsync } from '../../composition/validatePackedApmReleaseAsync.js';

/*** Parse release CLI input and report the same structured validation result on every entrypoint. */
export async function runApmReleaseCommandAsync(
  operation: 'sync' | 'validate',
  argv: readonly string[],
  context: CommandContext,
): Promise<{ readonly exitCode: number }> {
  try {
    const { target, options } = parseArguments(operation, argv, context.cwd);
    if (operation === 'sync') {
      context.writeStdout(
        `${JSON.stringify({ changed: await synchronizeApmReleaseDescriptorAsync(target) })}\n`,
      );
      return { exitCode: 0 };
    }
    const result = await validatePackedApmReleaseAsync(target, options);
    context.writeStdout(`${JSON.stringify(result)}\n`);
    return { exitCode: result.valid ? 0 : 1 };
  } catch (error) {
    context.writeStderr(
      `${error instanceof Error ? error.message : 'APM release validation failed.'}\n`,
    );
    return { exitCode: 1 };
  }
}

interface CommandContext {
  readonly cwd: string;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
}

/*** Separate release argument validation from execution; reject duplicates and incomplete flags. */
function parseArguments(
  operation: 'sync' | 'validate',
  argv: readonly string[],
  cwd: string,
): { readonly target: string; readonly options: ApmReleaseValidationOptions } {
  if (operation === 'sync' && argv.some((value) => value.startsWith('--')))
    throw new Error('APM sync does not accept validation options.');
  const artifactIndex = optionIndex(argv, '--artifact');
  const integrityIndex = optionIndex(argv, '--expected-integrity');
  const ignored = [artifactIndex, integrityIndex].flatMap((index) =>
    index < 0 ? [] : [index, index + 1],
  );
  const remaining = argv.filter(
    (value, index) => !ignored.includes(index) && value !== '--allow-owner-code',
  );
  if (remaining.length > 1 || remaining.some((value) => value.startsWith('-')))
    throw new Error('Expected one target directory and supported release options.');
  const artifact = artifactIndex < 0 ? undefined : argv.at(artifactIndex + 1);
  const integrity = integrityIndex < 0 ? undefined : argv.at(integrityIndex + 1);
  return {
    target: resolve(cwd, remaining.at(0) ?? '.'),
    options: {
      allowOwnerCode: argv.includes('--allow-owner-code'),
      ...(artifact === undefined ? {} : { artifactPath: resolve(cwd, artifact) }),
      ...(integrity === undefined ? {} : { expectedIntegrity: integrity }),
    },
  };
}

/*** Require a single option occurrence followed by a value. */
function optionIndex(argv: readonly string[], option: string): number {
  const index = argv.indexOf(option);
  if (index < 0) return index;
  const value = argv.at(index + 1);
  if (argv.lastIndexOf(option) !== index || value === undefined || value.startsWith('--'))
    throw new Error(`Invalid value for ${option}.`);
  return index;
}
