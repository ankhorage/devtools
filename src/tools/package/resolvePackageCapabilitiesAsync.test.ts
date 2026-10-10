import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Capability } from '@ankhorage/contracts/capability';
import { afterEach, expect, test } from 'bun:test';

import { inspectPackageManifest, syncPackageManifest } from './index.js';
import { resolvePackageCapabilitiesAsync } from './resolvePackageCapabilitiesAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('package capability materialization leaves packages without Ankh metadata unchanged', async () => {
  const target = await createFixture({ name: 'plain-package' });

  expect(await resolvePackageCapabilitiesAsync(target, await readManifest(target))).toBeUndefined();
});

test('package capability materialization leaves unrelated Ankh metadata without a catalog unchanged', async () => {
  const target = await createFixture({
    name: '@example/structure-only',
    ankh: { structure: { output: 'structure.json', roots: { source: 'src' } } },
  });

  expect(await resolvePackageCapabilitiesAsync(target, await readManifest(target))).toBeUndefined();
  await syncPackageManifest(target, '2.3.4', { dryRun: false });
  const synchronized = await readFile(join(target, 'package.json'), 'utf8');
  expect((await readManifest(target)).ankh).toEqual({
    structure: { output: 'structure.json', roots: { source: 'src' } },
  });
  expect((await syncPackageManifest(target, '2.3.4', { dryRun: false })).action).toBe('unchanged');
  expect(await readFile(join(target, 'package.json'), 'utf8')).toBe(synchronized);
});

test('package capability materialization ignores an unrelated public capabilities export', async () => {
  const target = await createFixture({
    name: '@example/contracts-like',
    ankh: { structure: { output: 'structure.json', roots: { source: 'src' } } },
    exports: { './capabilities': './dist/capabilities.js' },
  });

  expect(await resolvePackageCapabilitiesAsync(target, await readManifest(target))).toBeUndefined();
});

test('package capability materialization rejects stale metadata without a canonical catalog', async () => {
  const target = await createFixture({
    name: '@example/stale-capabilities',
    ankh: { capabilities: [capability('fixture.stale')] },
  });

  await expectCapabilityResolutionFailure(
    resolvePackageCapabilitiesAsync(target, await readManifest(target)),
    'ankh.capabilities requires the canonical src/capabilities/index.ts',
  );
});

test('package capability materialization supports static and cross-module derived catalogs', async () => {
  const staticTarget = await createCapabilityFixture(staticCatalogSource());
  const derivedTarget = await createCrossModuleDerivedCapabilityFixture();

  expect(
    await resolvePackageCapabilitiesAsync(staticTarget, await readManifest(staticTarget)),
  ).toEqual([capability('fixture.static')]);
  expect(
    await resolvePackageCapabilitiesAsync(derivedTarget, await readManifest(derivedTarget)),
  ).toEqual([capability('fixture.derived.one'), capability('fixture.derived.two')]);
  expect((await inspectPackageManifest(derivedTarget, '2.3.4')).state).toBe('outdated');
  await syncPackageManifest(derivedTarget, '2.3.4', { dryRun: false });
  const synchronized = await readFile(join(derivedTarget, 'package.json'), 'utf8');
  const materialized = await readManifest(derivedTarget);
  expect(materialized.ankh).toEqual({
    category: 'fixture',
    provider: null,
    capabilities: [capability('fixture.derived.one'), capability('fixture.derived.two')],
  });
  expect((await inspectPackageManifest(derivedTarget, '2.3.4')).state).toBe('current');
  expect((await syncPackageManifest(derivedTarget, '2.3.4', { dryRun: false })).action).toBe(
    'unchanged',
  );
  expect(await readFile(join(derivedTarget, 'package.json'), 'utf8')).toBe(synchronized);
});

test('package capability materialization uses standalone toolkit normalization', async () => {
  const target = await createCapabilityFixture(`export const CAPABILITIES = [{
  ...${JSON.stringify(capability('fixture.normalized'))},
  access: ['write', 'invoke', 'invoke'],
  binding: { kind: 'action', bindableAs: ['target', 'source', 'target'] },
}];\n`);

  expect(await resolvePackageCapabilitiesAsync(target, await readManifest(target))).toEqual([
    {
      ...capability('fixture.normalized'),
      access: ['invoke', 'write'],
      binding: { kind: 'action', bindableAs: ['source', 'target'] },
    },
  ]);
});

test('package capability materialization requires Ankh discovery metadata for a canonical catalog', async () => {
  const target = await createFixture({ name: '@example/missing-discovery' });
  await mkdir(join(target, 'src/capabilities'), { recursive: true });
  await Bun.write(join(target, 'src/capabilities/index.ts'), staticCatalogSource());

  await expectCapabilityResolutionFailure(
    resolvePackageCapabilitiesAsync(target, await readManifest(target)),
    'requires package.json ankh discovery metadata for publication',
  );
});

test('package capability materialization preserves provider-null and unrelated metadata', async () => {
  const target = await createCapabilityFixture(staticCatalogSource(), {
    category: 'fixture',
    provider: null,
    capabilities: [capability('fixture.stale')],
  });
  const authored = await readManifest(target);
  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify({ ...authored, extra: 'preserved' }, null, 2)}\n`,
  );

  expect((await inspectPackageManifest(target, '2.3.4')).state).toBe('outdated');
  expect((await syncPackageManifest(target, '2.3.4', { dryRun: false })).action).toBe('updated');
  const manifest = await readManifest(target);
  expect(manifest.extra).toBe('preserved');
  expect(manifest.ankh).toEqual({
    category: 'fixture',
    provider: null,
    capabilities: [capability('fixture.static')],
  });
});

test('package capability materialization preserves a CLI provider and removes stale capabilities', async () => {
  const target = await createCapabilityFixture(staticCatalogSource(), {
    category: 'fixture',
    provider: './dist/cli/index.js',
    capabilities: [capability('fixture.static'), capability('fixture.removed')],
  });

  await syncPackageManifest(target, '2.3.4', { dryRun: false });
  expect((await readManifest(target)).ankh).toEqual({
    category: 'fixture',
    provider: './dist/cli/index.js',
    capabilities: [capability('fixture.static')],
  });
});

test('package capability materialization reports drift and is byte-stable', async () => {
  const target = await createCapabilityFixture(staticCatalogSource(), {
    category: 'fixture',
    provider: null,
    capabilities: [capability('fixture.stale')],
  });
  const before = await readFile(join(target, 'package.json'), 'utf8');

  expect((await inspectPackageManifest(target, '2.3.4')).state).toBe('outdated');
  expect(await readFile(join(target, 'package.json'), 'utf8')).toBe(before);
  await syncPackageManifest(target, '2.3.4', { dryRun: false });
  const synchronized = await readFile(join(target, 'package.json'), 'utf8');
  expect((await inspectPackageManifest(target, '2.3.4')).state).toBe('current');
  expect((await syncPackageManifest(target, '2.3.4', { dryRun: false })).action).toBe('unchanged');
  expect(await readFile(join(target, 'package.json'), 'utf8')).toBe(synchronized);
});

test('package capability materialization fails for invalid and duplicate descriptors', async () => {
  const invalid = await createCapabilityFixture(
    'export const CAPABILITIES = [{ id: "invalid" }];\n',
  );
  const duplicate = await createCapabilityFixture(`export const CAPABILITIES = [
  ${JSON.stringify(capability('fixture.duplicate'))},
  ${JSON.stringify(capability('fixture.duplicate'))},
];\n`);

  await expectCapabilityResolutionFailure(
    resolvePackageCapabilitiesAsync(invalid, await readManifest(invalid)),
    'CAPABILITIES[0] is not a valid Capability',
  );
  await expectCapabilityResolutionFailure(
    resolvePackageCapabilitiesAsync(duplicate, await readManifest(duplicate)),
    'Duplicate capability id "fixture.duplicate"',
  );
});

test('package capability materialization keeps packed metadata equal to a public catalog with local TypeScript imports', async () => {
  const target = await createCrossModuleDerivedCapabilityFixture();
  const manifest = await readManifest(target);
  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify(
      {
        ...manifest,
        ankh: { category: 'fixture', provider: null },
        exports: { './capabilities': './dist/capabilities/index.js' },
        files: ['dist'],
        type: 'module',
      },
      null,
      2,
    )}\n`,
  );
  await syncPackageManifest(target, '2.3.4', { dryRun: false });
  const build = await Bun.build({
    entrypoints: [join(target, 'src/capabilities/index.ts')],
    outdir: join(target, 'dist/capabilities'),
    target: 'bun',
  });
  expect(build.success).toBe(true);

  const archive = join(target, 'fixture.tgz');
  await runCommand(['bun', 'pm', 'pack', '--filename', archive], target);
  const extraction = join(target, 'extracted');
  await mkdir(extraction);
  await runCommand(['tar', '-xzf', archive, '-C', extraction], target);

  const packedRoot = join(extraction, 'package');
  const packedManifest = await readManifest(packedRoot);
  const packedModule: unknown = await import(
    pathToFileURL(join(packedRoot, 'dist/capabilities/index.js')).href
  );
  if (!isRecord(packedModule) || !Array.isArray(packedModule.CAPABILITIES)) {
    throw new Error('Packed capability module must export CAPABILITIES.');
  }
  expect((packedManifest.ankh as { readonly capabilities: unknown }).capabilities).toEqual(
    packedModule.CAPABILITIES,
  );
});

async function createCapabilityFixture(
  source: string,
  ankh: Record<string, unknown> = { category: 'fixture', provider: null },
): Promise<string> {
  const target = await createFixture({ name: '@example/fixture', version: '1.0.0', ankh });
  await mkdir(join(target, 'src/capabilities'), { recursive: true });
  await Bun.write(join(target, 'src/capabilities/index.ts'), source);
  return target;
}

/*** Create a catalog fixture that derives descriptors from package-owned TypeScript metadata. */
async function createCrossModuleDerivedCapabilityFixture(): Promise<string> {
  const target = await createCapabilityFixture(derivedCatalogSource());
  await mkdir(join(target, 'src/metadata'), { recursive: true });
  await Bun.write(
    join(target, 'src/metadata/events.ts'),
    "export const EVENTS = ['one', 'two'];\n",
  );
  return target;
}

async function createFixture(manifest: Record<string, unknown>): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-package-capabilities-');
  temporaryDirectories.push(target);
  await Bun.write(join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}

async function readManifest(target: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as Record<
    string,
    unknown
  >;
}

function capability(id: `${string}.${string}`): Capability {
  return {
    id,
    owner: '@example/fixture',
    access: ['invoke'],
    binding: { kind: 'action', bindableAs: ['target'] },
  };
}

function staticCatalogSource(): string {
  return `export const CAPABILITIES = [${JSON.stringify(capability('fixture.static'))}];\n`;
}

function derivedCatalogSource(): string {
  return `import { EVENTS } from '../metadata/events';

export const CAPABILITIES = EVENTS.map((name) => ({
  id: \`fixture.derived.\${name}\`,
  owner: '@example/fixture',
  access: ['invoke'],
  binding: { kind: 'action', bindableAs: ['target'] },
}));
`;
}

async function runCommand(command: string[], cwd: string): Promise<void> {
  const process = Bun.spawn(command, { cwd, stderr: 'pipe', stdout: 'pipe' });
  if ((await process.exited) === 0) return;
  throw new Error(await new Response(process.stderr).text());
}

async function expectCapabilityResolutionFailure(
  resolution: Promise<unknown>,
  expectedMessage: string,
): Promise<void> {
  try {
    await resolution;
  } catch (error) {
    expect(error).toHaveProperty('message', expect.stringContaining(expectedMessage));
    return;
  }
  throw new Error(`Expected capability resolution to fail with: ${expectedMessage}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
