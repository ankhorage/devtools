import type { StructureDescriptor, StructureDescriptorDefinition, StructureDescriptorDocument } from '@ankhorage/contracts';
import type ts from 'typescript';

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

export interface StructureCompilerContext {
  readonly checker: ts.TypeChecker;
  readonly program: ts.Program;
  readonly targetDirectory: string;
  readonly packageName: string;
  readonly definitions: Map<string, StructureDescriptorDefinition>;
  readonly definitionSymbols: Map<string, ts.Symbol>;
  readonly resolving: Set<string>;
}

export interface StructureResolvedType {
  readonly descriptor: StructureDescriptor;
  readonly symbolName?: string;
}
