import type { StructureGenerationResult } from '../../../types/structure-generation.js';
import { createStructureGenerationWorkspacePort } from '../adapters/outbound/createStructureGenerationWorkspacePort.js';
import { synchronizeStructureArtifactAsync } from '../application/use-cases/synchronizeStructureArtifactAsync.js';

/*** Compose structure artifact generation with the Node workspace adapter for one package root. */
export async function synchronizeStructureArtifactForDirectoryAsync(
  operation: 'build' | 'check',
  targetDirectory: string,
): Promise<StructureGenerationResult> {
  return synchronizeStructureArtifactAsync(
    operation,
    createStructureGenerationWorkspacePort(targetDirectory),
  );
}
