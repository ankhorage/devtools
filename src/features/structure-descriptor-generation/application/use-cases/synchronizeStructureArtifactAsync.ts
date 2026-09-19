import type {
  StructureGenerationResult,
  StructureGenerationWorkspacePort,
} from '../../../../types/structure-generation.js';

/*** Build or check the deterministic structural descriptor artifact for one opted-in owner package. */
export async function synchronizeStructureArtifactAsync(
  operation: 'build' | 'check',
  port: StructureGenerationWorkspacePort,
): Promise<StructureGenerationResult> {
  const packageConfig = await port.readPackageAsync();
  if (!packageConfig) {
    return { applicable: false, changed: false, current: true };
  }

  const artifact = await port.generateArtifactAsync(packageConfig);
  const current = await port.readOutputAsync(packageConfig.config.output);
  const matches = current === artifact.source;

  if (operation === 'build' && !matches) {
    await port.writeOutputAsync(packageConfig.config.output, artifact.source);
  }

  return {
    applicable: true,
    changed: operation === 'build' && !matches,
    current: matches,
    outputPath: packageConfig.config.output,
    fingerprint: artifact.fingerprint,
  };
}
