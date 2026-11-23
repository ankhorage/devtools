import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import type { RepositoryMetadataBuildTarget } from '@ankhorage/contracts/metadata';
import { isRecord, readOwnProperty } from '@ankhorage/utility/object';

import type { ManagedFileDefinition } from '../../managed-files/managedFiles.js';
import { readRepositoryMetadataFactAsync } from '../../repository-metadata/application/readRepositoryMetadataFactAsync.js';

const OWNERSHIP_MARKER = '// Managed by @ankhorage/devtools.\n';

interface ResolvedTypeScriptTarget {
  readonly configPath: 'tsconfig.native.json' | 'tsconfig.web.json';
  readonly jsx: 'react-jsx' | 'react-native';
  readonly sourceEntry: string;
  readonly target: RepositoryMetadataBuildTarget;
}

/*** Resolve the Devtools-owned TypeScript configurations declared by repository metadata. */
export async function resolveBuildTargetManagedFilesAsync(
  targetDirectory: string,
): Promise<readonly ManagedFileDefinition[]> {
  const metadata = await readRepositoryMetadataFactAsync(targetDirectory);
  if (metadata.exists && metadata.document === undefined) {
    throw new Error(`Invalid repository metadata at ${metadata.path}.`);
  }
  const targets = metadata.document?.build?.targets;
  const manifest =
    targets === undefined ? undefined : await readPackageManifestAsync(targetDirectory);
  const inventory =
    targets === undefined || manifest === undefined
      ? []
      : await resolveTypeScriptTargetInventoryAsync(targetDirectory, targets, manifest);
  return await resolveManagedTargetDefinitionsAsync(targetDirectory, inventory);
}

/*** Validate supported TypeScript targets without inferring an unknown target's platform role. */
async function resolveTypeScriptTargetInventoryAsync(
  targetDirectory: string,
  targets: Readonly<Record<string, RepositoryMetadataBuildTarget>>,
  manifest: Record<string, unknown>,
): Promise<readonly ResolvedTypeScriptTarget[]> {
  for (const [id, target] of Object.entries(targets)) {
    if (target.language !== 'typescript' || (id !== 'native' && id !== 'web')) {
      throw new Error(
        `Unsupported build target: ${id}. Devtools supports only TypeScript native and web targets.`,
      );
    }
  }
  const native = readOwnProperty<RepositoryMetadataBuildTarget>(targets, 'native');
  const web = readOwnProperty<RepositoryMetadataBuildTarget>(targets, 'web');
  return await Promise.all([
    ...(native === undefined
      ? []
      : [
          resolveTypeScriptTargetAsync(targetDirectory, manifest, native, {
            configPath: 'tsconfig.native.json',
            expectedEntry: '.',
            expectedFramework: 'react-native',
            exportCondition: 'react-native',
            jsx: 'react-native',
            requiredPlatforms: ['ios', 'android', 'web'],
          }),
        ]),
    ...(web === undefined
      ? []
      : [
          resolveTypeScriptTargetAsync(targetDirectory, manifest, web, {
            configPath: 'tsconfig.web.json',
            expectedEntry: './web',
            expectedFramework: 'react',
            exportCondition: 'browser',
            jsx: 'react-jsx',
            requiredPlatforms: ['web'],
          }),
        ]),
  ]);
}

/*** Validate one declared target against its public export, output directory, and build owner. */
async function resolveTypeScriptTargetAsync(
  targetDirectory: string,
  manifest: Record<string, unknown>,
  target: RepositoryMetadataBuildTarget,
  expected: {
    readonly configPath: ResolvedTypeScriptTarget['configPath'];
    readonly expectedEntry: string;
    readonly expectedFramework: string;
    readonly exportCondition: string;
    readonly jsx: ResolvedTypeScriptTarget['jsx'];
    readonly requiredPlatforms: readonly string[];
  },
): Promise<ResolvedTypeScriptTarget> {
  if (
    target.framework !== expected.expectedFramework ||
    target.entry !== expected.expectedEntry ||
    !expected.requiredPlatforms.every((platform) => target.platforms.includes(platform)) ||
    (expected.expectedEntry === './web' && target.platforms.length !== 1)
  ) {
    throw new Error(`Invalid ${expected.expectedEntry} build target.`);
  }
  const sourceEntry = readSourceEntry(manifest, target, expected.exportCondition);
  assertTargetBuildScripts(manifest, expected.configPath);
  await assertSourceEntryExistsAsync(targetDirectory, sourceEntry);
  return { configPath: expected.configPath, jsx: expected.jsx, sourceEntry, target };
}

/*** Return only target definitions that are active or provably managed from an earlier sync. */
async function resolveManagedTargetDefinitionsAsync(
  targetDirectory: string,
  inventory: readonly ResolvedTypeScriptTarget[],
): Promise<readonly ManagedFileDefinition[]> {
  const byConfigPath = new Map(inventory.map((target) => [target.configPath, target] as const));
  const baseDefinition = await resolveBaseConfigDefinitionAsync(
    targetDirectory,
    inventory.length > 0,
  );
  const targetDefinitions = await Promise.all(
    (['tsconfig.native.json', 'tsconfig.web.json'] as const).map(async (relativePath) =>
      resolveTargetConfigDefinitionAsync(
        targetDirectory,
        relativePath,
        byConfigPath.get(relativePath),
      ),
    ),
  );
  return [baseDefinition, ...targetDefinitions].filter(
    (definition): definition is ManagedFileDefinition => definition !== undefined,
  );
}

/*** Resolve the shared base config only while target configs are active or visibly Devtools-owned. */
async function resolveBaseConfigDefinitionAsync(
  targetDirectory: string,
  isActive: boolean,
): Promise<ManagedFileDefinition | undefined> {
  const relativePath = 'tsconfig.base.json';
  if (!isActive && !(await hasOwnershipMarkerAsync(targetDirectory, relativePath)))
    return undefined;
  return {
    relativePath,
    contents: renderBaseConfig(),
    isApplicable: () => isActive,
    ownershipMarker: OWNERSHIP_MARKER,
  };
}

/*** Resolve one target config only while active or visibly Devtools-owned from an earlier sync. */
async function resolveTargetConfigDefinitionAsync(
  targetDirectory: string,
  relativePath: ResolvedTypeScriptTarget['configPath'],
  target: ResolvedTypeScriptTarget | undefined,
): Promise<ManagedFileDefinition | undefined> {
  if (target === undefined && !(await hasOwnershipMarkerAsync(targetDirectory, relativePath))) {
    return undefined;
  }
  return {
    relativePath,
    contents: target === undefined ? `${OWNERSHIP_MARKER}{}\n` : renderTargetConfig(target),
    isApplicable: () => target !== undefined,
    ownershipMarker: OWNERSHIP_MARKER,
  };
}

/*** Read the authored package manifest required to prove each declared public build artifact. */
async function readPackageManifestAsync(targetDirectory: string): Promise<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(
      await readFile(join(targetDirectory, 'package.json'), 'utf8'),
    ) as unknown;
    if (!isRecord(parsed)) throw new Error('Expected package.json to contain a JSON object.');
    return parsed;
  } catch (error) {
    throw new Error('Unable to validate build targets against package.json.', { cause: error });
  }
}

/*** Resolve the source entry and output artifact declared by one public package export. */
function readSourceEntry(
  manifest: Record<string, unknown>,
  target: RepositoryMetadataBuildTarget,
  condition: string,
): string {
  const { exports } = manifest;
  if (!isRecord(exports)) {
    throw new Error(`Missing public export for build target: ${target.entry}.`);
  }
  const entry = readOwnProperty<unknown>(exports, target.entry);
  if (!isRecord(entry)) {
    throw new Error(`Missing public export for build target: ${target.entry}.`);
  }
  const source = readOwnProperty<unknown>(entry, condition);
  if (typeof source !== 'string' || !source.startsWith('./src/') || !/\.tsx?$/u.test(source)) {
    throw new Error(
      `Build target ${target.entry} requires a ${condition} TypeScript source export.`,
    );
  }
  const outputDirectory = `./${target.outDir}/`;
  if (!collectExportPaths(entry).some((path) => path.startsWith(outputDirectory))) {
    throw new Error(
      `Build target ${target.entry} does not publish artifacts from ${target.outDir}.`,
    );
  }
  return source.slice(2);
}

/*** Traverse nested conditional exports while preserving only package-relative artifact paths. */
function collectExportPaths(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(collectExportPaths);
}

/*** Require repository-owned build and typecheck commands to consume the generated target config. */
function assertTargetBuildScripts(manifest: Record<string, unknown>, configPath: string): void {
  const { scripts } = manifest;
  if (
    !isRecord(scripts) ||
    typeof scripts.build !== 'string' ||
    typeof scripts.typecheck !== 'string'
  ) {
    throw new Error('Build targets require repository-owned build and typecheck scripts.');
  }
  const { build, typecheck } = scripts;
  if (!build.includes(configPath) && !typecheck.includes(configPath)) {
    throw new Error(
      `Build target configuration is not consumed by build or typecheck: ${configPath}.`,
    );
  }
}

/*** Verify that the public source entry exists before generating a compiler root for it. */
async function assertSourceEntryExistsAsync(
  targetDirectory: string,
  sourceEntry: string,
): Promise<void> {
  if (!(await Bun.file(join(targetDirectory, sourceEntry)).exists())) {
    throw new Error(`Build target source entry does not exist: ${sourceEntry}.`);
  }
}

/*** Detect a file generated by this owner without treating author-owned files as removable. */
async function hasOwnershipMarkerAsync(
  targetDirectory: string,
  relativePath: string,
): Promise<boolean> {
  try {
    return (await readFile(join(targetDirectory, relativePath), 'utf8')).startsWith(
      OWNERSHIP_MARKER,
    );
  } catch {
    return false;
  }
}

/*** Render shared strict NodeNext compiler options for every declared TypeScript artifact. */
function renderBaseConfig(): string {
  return `${OWNERSHIP_MARKER}${JSON.stringify({ $schema: 'https://json.schemastore.org/tsconfig', compilerOptions: { declaration: true, forceConsistentCasingInFileNames: true, module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: false, strict: true, target: 'ES2022' } }, null, 2)}\n`;
}

/*** Render one target-specific output configuration while leaving repository builders in control. */
function renderTargetConfig(target: ResolvedTypeScriptTarget): string {
  return `${OWNERSHIP_MARKER}${JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: { jsx: target.jsx, outDir: target.target.outDir, rootDir: 'src' }, exclude: ['node_modules', target.target.outDir], files: [target.sourceEntry] }, null, 2)}\n`;
}
