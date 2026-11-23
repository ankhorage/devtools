import type { RepositoryMetadataBuildTarget } from '@ankhorage/contracts/metadata';

import type { ManagedFileDefinition } from '../../managed-files/managedFiles.js';
import { readRepositoryMetadataFactAsync } from '../../repository-metadata/application/readRepositoryMetadataFactAsync.js';

/*** Resolve the Devtools-owned TypeScript configurations declared by repository metadata. */
export async function resolveBuildTargetManagedFilesAsync(
  targetDirectory: string,
): Promise<readonly ManagedFileDefinition[]> {
  const metadata = await readRepositoryMetadataFactAsync(targetDirectory);
  const targets = metadata.document?.build?.targets;
  if (targets === undefined) return [];

  const inventory = resolveTypeScriptTargetInventory(targets);
  if (inventory.native === undefined && inventory.web === undefined) return [];
  return [
    { relativePath: 'tsconfig.base.json', contents: renderBaseConfig() },
    ...(inventory.native === undefined
      ? [{ relativePath: 'tsconfig.native.json', contents: '', isApplicable: () => false }]
      : [
          {
            relativePath: 'tsconfig.native.json',
            contents: renderTargetConfig(inventory.native, 'react-native'),
          },
        ]),
    ...(inventory.web === undefined
      ? [{ relativePath: 'tsconfig.web.json', contents: '', isApplicable: () => false }]
      : [
          {
            relativePath: 'tsconfig.web.json',
            contents: renderTargetConfig(inventory.web, 'react-jsx'),
          },
        ]),
  ];
}

interface TargetInventory {
  readonly native?: RepositoryMetadataBuildTarget;
  readonly web?: RepositoryMetadataBuildTarget;
}

/*** Validate supported TypeScript targets without inferring an unknown target's platform role. */
function resolveTypeScriptTargetInventory(
  targets: Readonly<Record<string, RepositoryMetadataBuildTarget>>,
): TargetInventory {
  const entries = Object.entries(targets);
  for (const [id, target] of entries) {
    if (target.language !== 'typescript' || (id !== 'native' && id !== 'web')) {
      throw new Error(
        `Unsupported build target: ${id}. Devtools supports only TypeScript native and web targets.`,
      );
    }
  }
  const { native, web } = targets;
  if (
    native.framework !== 'react-native' ||
    !['ios', 'android', 'web'].every((platform) => native.platforms.includes(platform))
  ) {
    throw new Error(
      'Invalid native build target: expected the React Native iOS, Android, and web artifact.',
    );
  }
  if (web.framework !== 'react' || web.platforms.length !== 1 || web.platforms[0] !== 'web') {
    throw new Error('Invalid web build target: expected the React web artifact.');
  }
  return { native, web };
}

/*** Render shared strict NodeNext compiler options for every declared TypeScript artifact. */
function renderBaseConfig(): string {
  return `${JSON.stringify({ $schema: 'https://json.schemastore.org/tsconfig', compilerOptions: { declaration: true, forceConsistentCasingInFileNames: true, module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: false, strict: true, target: 'ES2022' } }, null, 2)}\n`;
}

/*** Render one target-specific output configuration while leaving repository builders in control. */
function renderTargetConfig(
  target: RepositoryMetadataBuildTarget,
  jsx: 'react-jsx' | 'react-native',
): string {
  return `${JSON.stringify({ extends: './tsconfig.base.json', compilerOptions: { jsx, outDir: target.outDir, rootDir: 'src' }, exclude: ['node_modules', target.outDir], include: ['src/**/*.ts', 'src/**/*.tsx'] }, null, 2)}\n`;
}
