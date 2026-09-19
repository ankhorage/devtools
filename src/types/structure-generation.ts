import type { StructureDescriptorDocument } from '@ankhorage/contracts/structure';

export interface StructureGenerationRoot {
  readonly source: string;
  readonly export: string;
}

export interface StructureGenerationConfig {
  readonly output: string;
  readonly roots: Readonly<Record<string, StructureGenerationRoot>>;
}

export interface StructureGenerationPackage {
  readonly name: string;
  readonly version: string;
  readonly config: StructureGenerationConfig;
}

export interface StructureGenerationArtifact {
  readonly document: StructureDescriptorDocument;
  readonly fingerprint: string;
  readonly source: string;
}

export interface StructureGenerationResult {
  readonly applicable: boolean;
  readonly changed: boolean;
  readonly current: boolean;
  readonly outputPath?: string;
  readonly fingerprint?: string;
}

export interface StructureGenerationWorkspacePort {
  readonly readPackageAsync: () => Promise<StructureGenerationPackage | null>;
  readonly generateArtifactAsync: (
    packageConfig: StructureGenerationPackage,
  ) => Promise<StructureGenerationArtifact>;
  readonly readOutputAsync: (relativePath: string) => Promise<string | null>;
  readonly writeOutputAsync: (relativePath: string, source: string) => Promise<void>;
}
