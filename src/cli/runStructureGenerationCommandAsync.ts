import { resolve } from 'node:path';

import { synchronizeStructureArtifactForDirectoryAsync } from '../features/structure-descriptor-generation/composition/synchronizeStructureArtifactForDirectoryAsync.js';

/*** Parse structure build/check CLI input and emit one machine-readable result. */
export async function runStructureGenerationCommandAsync(
  operation: 'build' | 'check',
  argv: readonly string[],
  context: StructureGenerationCommandContext,
): Promise<{ readonly exitCode: number }> {
  try {
    const target = parseTarget(argv, context.cwd);
    const result = await synchronizeStructureArtifactForDirectoryAsync(operation, target);
    context.writeStdout(`${JSON.stringify(result)}\n`);
    return { exitCode: operation === 'check' && result.applicable && !result.current ? 1 : 0 };
  } catch (error) {
    context.writeStderr(
      `${error instanceof Error ? error.message : 'Structure generation failed.'}\n`,
    );
    return { exitCode: 1 };
  }
}

interface StructureGenerationCommandContext {
  readonly cwd: string;
  readonly writeStdout: (text: string) => void;
  readonly writeStderr: (text: string) => void;
}

/*** Resolve the optional target directory and reject unsupported flags/extra operands. */
function parseTarget(argv: readonly string[], cwd: string): string {
  if (argv.length > 1 || argv.some((value) => value.startsWith('-'))) {
    throw new Error('Expected at most one structure-generation target directory.');
  }
  return resolve(cwd, argv.at(0) ?? '.');
}
