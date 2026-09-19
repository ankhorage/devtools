import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { isStructureDescriptorDocument } from '@ankhorage/contracts/structure';
import ts from 'typescript';

import type {
  StructureCompilerContext,
  StructureGenerationArtifact,
  StructureGenerationPackage,
} from '../../../../types/structure-generation.js';
import { resolveStructureType } from '../../utils/resolveStructureType.js';

/*** Generate one deterministic structural descriptor artifact from explicit public type roots. */
export async function generateStructureArtifactFromTypescriptAsync(
  targetDirectory: string,
  packageConfig: StructureGenerationPackage,
): Promise<StructureGenerationArtifact> {
  const { program, checker } = createCompiler(targetDirectory, packageConfig);
  assertProgramDiagnostics(program, targetDirectory);

  const context: StructureCompilerContext = {
    checker,
    program,
    targetDirectory,
    packageName: packageConfig.name,
    definitions: new Map(),
    definitionSymbols: new Map(),
    resolving: new Set(),
  };

  const roots = resolveRoots(packageConfig, context);
  const document = {
    protocolVersion: 1,
    packageName: packageConfig.name,
    packageVersion: packageConfig.version,
    roots,
    descriptors: Object.fromEntries(
      [...context.definitions.entries()].sort(([left], [right]) => left.localeCompare(right)),
    ),
  } as const;

  if (!isStructureDescriptorDocument(document)) {
    throw new Error('Generated structural descriptor document failed canonical Contracts validation.');
  }

  const serialized = JSON.stringify(document, null, 2);
  const fingerprint = `sha256:${createHash('sha256').update(serialized).digest('hex')}`;
  return {
    document,
    fingerprint,
    source: renderArtifactSource(serialized, fingerprint),
  };
}

/*** Build a TypeScript program containing the target project plus every explicit structure root source. */
function createCompiler(
  targetDirectory: string,
  packageConfig: StructureGenerationPackage,
): { readonly program: ts.Program; readonly checker: ts.TypeChecker } {
  const configPath = ts.findConfigFile(targetDirectory, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error('Structure generation requires a project tsconfig.json.');

  const loaded = ts.readConfigFile(configPath, ts.sys.readFile);
  if (loaded.error) throw new Error(formatDiagnostic(loaded.error, targetDirectory));

  const parsed = ts.parseJsonConfigFileContent(loaded.config, ts.sys, targetDirectory);
  const rootSources = Object.values(packageConfig.config.roots).map((root) =>
    resolve(targetDirectory, root.source),
  );
  const rootNames = [...new Set([...parsed.fileNames, ...rootSources])].sort();
  const program = ts.createProgram({ rootNames, options: parsed.options });
  return { program, checker: program.getTypeChecker() };
}

/*** Fail closed when target compilation contains an error diagnostic. */
function assertProgramDiagnostics(program: ts.Program, targetDirectory: string): void {
  const errors = ts.getPreEmitDiagnostics(program).filter(
    (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error,
  );
  if (errors.length === 0) return;

  throw new Error(
    errors
      .slice(0, 10)
      .map((diagnostic) => formatDiagnostic(diagnostic, targetDirectory))
      .join('\n'),
  );
}

/*** Resolve every opted-in export to a stable local descriptor definition. */
function resolveRoots(
  packageConfig: StructureGenerationPackage,
  context: StructureCompilerContext,
): Readonly<Record<string, string>> {
  return Object.fromEntries(
    Object.entries(packageConfig.config.roots)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([rootName, root]) => [rootName, resolveRoot(rootName, root, context)]),
  );
}

/*** Resolve one configured public export and materialize its root definition. */
function resolveRoot(
  rootName: string,
  root: StructureGenerationPackage['config']['roots'][string],
  context: StructureCompilerContext,
): string {
  const sourcePath = resolve(context.targetDirectory, root.source);
  const sourceFile = context.program.getSourceFile(sourcePath);
  if (!sourceFile) {
    throw new Error(`Structure root "${rootName}" source is not part of the TypeScript program.`);
  }
  const moduleSymbol = context.checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) {
    throw new Error(`Structure root "${rootName}" source has no module symbol.`);
  }

  const exported = context.checker
    .getExportsOfModule(moduleSymbol)
    .find((symbol) => symbol.getName() === root.export);
  if (!exported) {
    throw new Error(`Structure root "${rootName}" cannot find exported type "${root.export}".`);
  }

  const symbol =
    (exported.flags & ts.SymbolFlags.Alias) !== 0
      ? context.checker.getAliasedSymbol(exported)
      : exported;
  const id = symbol.getName();
  materializeRootDefinition(id, symbol, context);
  return id;
}

/*** Materialize a configured root inline while nested named types remain references. */
function materializeRootDefinition(
  id: string,
  symbol: ts.Symbol,
  context: StructureCompilerContext,
): void {
  const previous = context.definitionSymbols.get(id);
  if (previous && previous !== symbol) throw new Error(`Duplicate structural descriptor id "${id}".`);
  if (context.definitions.has(id)) return;

  const type = context.checker.getDeclaredTypeOfSymbol(symbol);
  context.definitionSymbols.set(id, symbol);
  context.resolving.add(id);
  context.definitions.set(id, { id, descriptor: resolveStructureType(type, context, symbol) });
  context.resolving.delete(id);
}

/*** Render a generated source module containing the canonical document and its content fingerprint. */
function renderArtifactSource(serialized: string, fingerprint: string): string {
  return [
    '/* This file is generated by @ankhorage/devtools. Do not edit manually. */',
    "import type { StructureDescriptorDocument } from '@ankhorage/contracts/structure';",
    '',
    `export const STRUCTURE_DESCRIPTOR_FINGERPRINT = '${fingerprint}';`,
    '',
    'export const STRUCTURE_DESCRIPTOR = ' + serialized + ' as const satisfies StructureDescriptorDocument;',
    '',
  ].join('\n');
}

/*** Render one compiler diagnostic without leaking absolute source paths. */
function formatDiagnostic(diagnostic: ts.Diagnostic, targetDirectory: string): string {
  const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
  if (!diagnostic.file) return message;

  const relative = diagnostic.file.fileName.startsWith(targetDirectory)
    ? diagnostic.file.fileName.slice(targetDirectory.length).replace(/^[/\\]+/u, '')
    : diagnostic.file.fileName.split(/[/\\]/u).at(-1);
  return relative ? `${relative}: ${message}` : message;
}
