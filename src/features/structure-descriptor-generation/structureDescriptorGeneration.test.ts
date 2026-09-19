import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { synchronizeStructureArtifactForDirectoryAsync } from './composition/synchronizeStructureArtifactForDirectoryAsync.js';

const createdDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

test('generates deterministic structural semantics from explicit public type roots', async () => {
  const target = await createFixtureProject();

  const first = await synchronizeStructureArtifactForDirectoryAsync('build', target);
  const generated = await readFile(join(target, 'src/generated/structure.ts'), 'utf8');
  const second = await synchronizeStructureArtifactForDirectoryAsync('check', target);

  expect(first.applicable).toBe(true);
  expect(first.changed).toBe(true);
  expect(first.current).toBe(false);
  expect(second.current).toBe(true);
  expect(second.fingerprint).toBe(first.fingerprint);
  expect(generated).toContain('"kind": "entity-registry"');
  expect(generated).toContain('"identityField": "id"');
  expect(generated).toContain('"kind": "value-map"');
  expect(generated).toContain('"kind": "set"');
  expect(generated).toContain('"kind": "ordered-list"');
  expect(generated).toContain('"discriminator": "kind"');
  expect(generated).toContain('"packageName": "@ankhorage/contracts"');
  expect(generated).not.toContain(target);
});

test('source file relocation does not perturb semantic output', async () => {
  const target = await createFixtureProject();
  await synchronizeStructureArtifactForDirectoryAsync('build', target);
  const before = await readFile(join(target, 'src/generated/structure.ts'), 'utf8');

  await rename(join(target, 'src/public.ts'), join(target, 'src/renamed.ts'));
  await writePackageJson(target, 'src/renamed.ts');
  const result = await synchronizeStructureArtifactForDirectoryAsync('build', target);
  const after = await readFile(join(target, 'src/generated/structure.ts'), 'utf8');

  expect(result.changed).toBe(false);
  expect(after).toBe(before);
});

test('public semantic changes alter the descriptor fingerprint', async () => {
  const target = await createFixtureProject();
  const first = await synchronizeStructureArtifactForDirectoryAsync('build', target);

  const sourcePath = join(target, 'src/public.ts');
  const source = await readFile(sourcePath, 'utf8');
  await writeFile(sourcePath, source.replace("'light' | 'dark'", "'light' | 'dark' | 'auto'"));
  const second = await synchronizeStructureArtifactForDirectoryAsync('build', target);

  expect(second.changed).toBe(true);
  expect(second.fingerprint).not.toBe(first.fingerprint);
});

test('fails closed for unsupported public structure instead of guessing', async () => {
  const target = await createFixtureProject();
  const sourcePath = join(target, 'src/public.ts');
  await writeFile(sourcePath, `export interface AppRoot { readonly unsupported: any; }\n`, 'utf8');

  let failure = '';
  try {
    await synchronizeStructureArtifactForDirectoryAsync('build', target);
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
  }
  expect(failure).toMatch(/Cannot generate structure.*any.*unsupported TypeScript type/u);
});

test('check reports stale evidence without mutating it', async () => {
  const target = await createFixtureProject();
  await synchronizeStructureArtifactForDirectoryAsync('build', target);
  const outputPath = join(target, 'src/generated/structure.ts');
  const current = await readFile(outputPath, 'utf8');
  await writeFile(outputPath, `${current}// stale\n`, 'utf8');

  const result = await synchronizeStructureArtifactForDirectoryAsync('check', target);
  const after = await readFile(outputPath, 'utf8');

  expect(result.current).toBe(false);
  expect(result.changed).toBe(false);
  expect(after).toBe(`${current}// stale\n`);
});

async function createFixtureProject(): Promise<string> {
  const target = await mkdtemp(join(process.cwd(), '.tmp-structure-'));
  createdDirectories.push(target);
  await mkdir(join(target, 'src'), { recursive: true });
  await writePackageJson(target, 'src/public.ts');
  await writeFile(
    join(target, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ESNext',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
        },
        include: ['src/**/*.ts'],
      },
      null,
      2,
    ),
  );
  await writeFile(join(target, 'src/public.ts'), FIXTURE_SOURCE);
  return target;
}

async function writePackageJson(target: string, source: string): Promise<void> {
  await writeFile(
    join(target, 'package.json'),
    JSON.stringify(
      {
        name: '@ankhorage/structure-fixture',
        version: '1.2.3',
        type: 'module',
        ankh: {
          structure: {
            output: 'src/generated/structure.ts',
            roots: {
              app: { source, export: 'AppRoot' },
            },
          },
        },
      },
      null,
      2,
    ),
  );
}

const FIXTURE_SOURCE = `
import type {
  EntityRegistry,
  SerializableSet,
  ThemeConfig,
  ValueMap,
} from '@ankhorage/contracts';

export type Mode = 'light' | 'dark';

export interface Item {
  readonly id: string;
  readonly enabled?: boolean;
}

export type ItemRegistry = EntityRegistry<string, Item, 'id'>;
export type NumericValues = ValueMap<string, number>;
export type Membership = SerializableSet<'camera' | 'microphone'>;

export interface Tree {
  readonly label: string;
  readonly children?: readonly Tree[];
}

export interface LiteralSource {
  readonly kind: 'literal';
  readonly value: string;
}

export interface StateSource {
  readonly kind: 'state';
  readonly path: string;
}

export type Source = LiteralSource | StateSource;

export interface AppRoot {
  readonly mode: Mode;
  readonly items: ItemRegistry;
  readonly values: NumericValues;
  readonly membership: Membership;
  readonly ordered: readonly Item[];
  readonly tree?: Tree;
  readonly source: Source;
  readonly externalTheme?: ThemeConfig;
}
`;
