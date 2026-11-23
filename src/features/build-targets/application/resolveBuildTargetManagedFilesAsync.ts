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
  readonly sources: ResolvedSourceInputs;
  readonly target: RepositoryMetadataBuildTarget;
}

interface ResolvedSourceInputs {
  readonly entries: readonly string[];
  readonly include: readonly string[];
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
            expectedFramework: 'react-native',
            jsx: 'react-native',
            requiredPlatforms: ['ios', 'android', 'web'],
          }),
        ]),
    ...(web === undefined
      ? []
      : [
          resolveTypeScriptTargetAsync(targetDirectory, manifest, web, {
            configPath: 'tsconfig.web.json',
            expectedFramework: 'react',
            jsx: 'react-jsx',
            requiredPlatforms: ['web'],
          }),
        ]),
  ]);
}

/*** Validate one declared target against its public output, explicit compiler inputs, and build owner. */
async function resolveTypeScriptTargetAsync(
  targetDirectory: string,
  manifest: Record<string, unknown>,
  target: RepositoryMetadataBuildTarget,
  expected: {
    readonly configPath: ResolvedTypeScriptTarget['configPath'];
    readonly expectedFramework: string;
    readonly jsx: ResolvedTypeScriptTarget['jsx'];
    readonly requiredPlatforms: readonly string[];
  },
): Promise<ResolvedTypeScriptTarget> {
  if (
    target.framework !== expected.expectedFramework ||
    !expected.requiredPlatforms.every((platform) => target.platforms.includes(platform)) ||
    (expected.configPath === 'tsconfig.web.json' && target.platforms.length !== 1)
  ) {
    throw new Error(`Invalid ${expected.configPath} build target.`);
  }
  assertTargetPublicOutput(manifest, target);
  const sources = readTargetSources(target);
  assertTargetBuilderScript(manifest, target);
  await assertSourceEntriesExistAsync(targetDirectory, sources.entries);
  return { configPath: expected.configPath, jsx: expected.jsx, sources, target };
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

/*** Validate that the public export emits the declared artifact independently of compiler inputs. */
function assertTargetPublicOutput(
  manifest: Record<string, unknown>,
  target: RepositoryMetadataBuildTarget,
): void {
  const { exports } = manifest;
  if (!isRecord(exports)) {
    throw new Error(`Missing public export for build target: ${target.entry}.`);
  }
  const entry = readOwnProperty<unknown>(exports, target.entry);
  if (!isRecord(entry)) {
    throw new Error(`Missing public export for build target: ${target.entry}.`);
  }
  const outputDirectory = `./${target.outDir}/`;
  if (!collectExportPaths(entry).some((path) => path.startsWith(outputDirectory))) {
    throw new Error(
      `Build target ${target.entry} does not publish artifacts from ${target.outDir}.`,
    );
  }
}

/*** Traverse nested conditional exports while preserving only package-relative artifact paths. */
function collectExportPaths(value: unknown): readonly string[] {
  if (typeof value === 'string') return [value];
  if (!isRecord(value)) return [];
  return Object.values(value).flatMap(collectExportPaths);
}

/*** Resolve Devtools-required explicit compiler inputs without applying source-layout conventions. */
function readTargetSources(target: RepositoryMetadataBuildTarget): ResolvedSourceInputs {
  const entries = target.sources?.entries ?? [];
  const include = target.sources?.include ?? [];
  if (entries.length === 0 && include.length === 0) {
    throw new Error(
      `Build target ${target.entry} requires explicit sources.entries or sources.include.`,
    );
  }
  return { entries, include };
}

/*** Validate an explicitly declared repository-owned builder by its package script key. */
function assertTargetBuilderScript(
  manifest: Record<string, unknown>,
  target: RepositoryMetadataBuildTarget,
): void {
  if (target.builder === undefined) return;
  const { scripts } = manifest;
  if (!isRecord(scripts) || typeof scripts[target.builder.script] !== 'string') {
    throw new Error(
      `Build target ${target.entry} references a missing builder script: ${target.builder.script}.`,
    );
  }
}

/*** Verify explicit source entries exist without interpreting public package export conditions. */
async function assertSourceEntriesExistAsync(
  targetDirectory: string,
  entries: readonly string[],
): Promise<void> {
  await Promise.all(
    entries.map(async (entry) => {
      if (!(await Bun.file(join(targetDirectory, entry)).exists())) {
        throw new Error(`Build target source entry does not exist: ${entry}.`);
      }
    }),
  );
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
  return `${OWNERSHIP_MARKER}${JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: { jsx: target.jsx, outDir: target.target.outDir }, exclude: ['node_modules', target.target.outDir], ...(target.sources.entries.length === 0 ? {} : { files: target.sources.entries }), ...(target.sources.include.length === 0 ? {} : { include: target.sources.include }) }, null, 2)}\n`;
}
