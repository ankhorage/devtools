import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { inspectManagedFiles, syncManagedFiles } from '../../managed-files/managedFiles.js';
import { resolveBuildTargetManagedFilesAsync } from './resolveBuildTargetManagedFilesAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('generates isolated native and web TypeScript roots from public target entries', async () => {
  const target = await createTargetAsync();
  const definitions = await resolveBuildTargetManagedFilesAsync(target);

  expect(definitions.map((definition) => definition.relativePath)).toEqual([
    'tsconfig.base.json',
    'tsconfig.native.json',
    'tsconfig.web.json',
  ]);
  await syncManagedFiles(target, definitions, { dryRun: false });
  expect(await readFile(join(target, 'tsconfig.native.json'), 'utf8')).toContain(
    '"files": [\n    "src/index.ts"\n  ]',
  );
  expect(await readFile(join(target, 'tsconfig.web.json'), 'utf8')).toContain(
    '"files": [\n    "src/web.ts"\n  ]',
  );
  expect(await readFile(join(target, 'tsconfig.web.json'), 'utf8')).not.toContain('"include"');
  expect(await inspectManagedFiles(target, definitions)).toEqual([
    { relativePath: 'tsconfig.base.json', state: 'current' },
    { relativePath: 'tsconfig.native.json', state: 'current' },
    { relativePath: 'tsconfig.web.json', state: 'current' },
  ]);
});

test('supports one declared TypeScript target without dereferencing the absent target', async () => {
  const target = await createTargetAsync({ build: { targets: { native: nativeTarget } } });
  const definitions = await resolveBuildTargetManagedFilesAsync(target);

  expect(definitions.map((definition) => definition.relativePath)).toEqual([
    'tsconfig.base.json',
    'tsconfig.native.json',
  ]);
});

test('rejects invalid metadata instead of treating it as an absent target declaration', async () => {
  const target = await createTargetAsync({
    build: { targets: { native: { language: 'typescript' } } },
  });

  await expectFailureAsync(
    resolveBuildTargetManagedFilesAsync(target),
    'Invalid repository metadata at src/metadata/repository.json.',
  );
});

test('rejects unsupported target identifiers without inferring a platform role', async () => {
  const target = await createTargetAsync({
    build: { targets: { browser: webTarget } },
  });

  await expectFailureAsync(
    resolveBuildTargetManagedFilesAsync(target),
    'Unsupported build target: browser.',
  );
});

test('rejects targets whose public export omits their declared artifact output', async () => {
  const target = await createTargetAsync();
  await writePackageAsync(target, {
    '.': {
      'react-native': './src/index.ts',
      import: './dist/index.js',
      types: './dist/index.d.ts',
    },
    './web': {
      browser: './src/web.ts',
      import: './src/web.ts',
      types: './src/web.ts',
    },
  });

  await expectFailureAsync(
    resolveBuildTargetManagedFilesAsync(target),
    'Build target ./web does not publish artifacts from web-dist.',
  );
});

test('rejects targets when repository-owned commands do not consume their generated config', async () => {
  const target = await createTargetAsync();
  await writePackageAsync(
    target,
    {
      '.': {
        'react-native': './src/index.ts',
        import: './dist/index.js',
        types: './dist/index.d.ts',
      },
      './web': {
        browser: './src/web.ts',
        import: './web-dist/index.js',
        types: './web-dist/index.d.ts',
      },
    },
    { build: 'bun scripts/build.ts', typecheck: 'bun x tsc --noEmit' },
  );

  await expectFailureAsync(
    resolveBuildTargetManagedFilesAsync(target),
    'Build target configuration is not consumed by build or typecheck: tsconfig.native.json.',
  );
});

test('removes only marked target configs after targets are removed', async () => {
  const target = await createTargetAsync();
  await syncManagedFiles(target, await resolveBuildTargetManagedFilesAsync(target), {
    dryRun: false,
  });
  await writeMetadataAsync(target, {});

  const definitions = await resolveBuildTargetManagedFilesAsync(target);
  expect(await inspectManagedFiles(target, definitions)).toEqual([
    { relativePath: 'tsconfig.base.json', state: 'obsolete' },
    { relativePath: 'tsconfig.native.json', state: 'obsolete' },
    { relativePath: 'tsconfig.web.json', state: 'obsolete' },
  ]);
  expect(await syncManagedFiles(target, definitions, { dryRun: false })).toEqual([
    { relativePath: 'tsconfig.base.json', action: 'removed' },
    { relativePath: 'tsconfig.native.json', action: 'removed' },
    { relativePath: 'tsconfig.web.json', action: 'removed' },
  ]);
});

test('refuses to overwrite an author-owned target config', async () => {
  const target = await createTargetAsync();
  await writeFile(join(target, 'tsconfig.native.json'), '{}\n');

  await expectFailureAsync(
    inspectManagedFiles(target, await resolveBuildTargetManagedFilesAsync(target)),
    'Failed to inspect managed file',
  );
});

/*** Assert that a promise fails with an expected user-facing message. */
async function expectFailureAsync(operation: Promise<unknown>, message: string): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(error).toHaveProperty('message', expect.stringContaining(message));
    return;
  }
  throw new Error(`Expected operation to fail with: ${message}`);
}

const nativeTarget = {
  language: 'typescript',
  framework: 'react-native',
  platforms: ['ios', 'android', 'web'],
  entry: '.',
  outDir: 'dist',
};

const webTarget = {
  language: 'typescript',
  framework: 'react',
  platforms: ['web'],
  entry: './web',
  outDir: 'web-dist',
};

/*** Create a repository fixture with real public source entries and target-aware package scripts. */
async function createTargetAsync(
  metadata: Record<string, unknown> = {
    build: { targets: { native: nativeTarget, web: webTarget } },
  },
): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-build-targets-');
  temporaryDirectories.push(target);
  await mkdir(join(target, 'src/metadata'), { recursive: true });
  await writeFile(join(target, 'src/index.ts'), 'export {};\n');
  await writeFile(join(target, 'src/web.ts'), 'export {};\n');
  await writePackageAsync(target, defaultExports);
  await writeMetadataAsync(target, metadata);
  return target;
}

const defaultExports = {
  '.': {
    'react-native': './src/index.ts',
    import: './dist/index.js',
    types: './dist/index.d.ts',
  },
  './web': {
    browser: './src/web.ts',
    import: './web-dist/index.js',
    types: './web-dist/index.d.ts',
  },
};

const defaultScripts = {
  build: 'bun x tsc -p tsconfig.native.json && bun x tsc -p tsconfig.web.json',
  typecheck:
    'bun x tsc --noEmit -p tsconfig.native.json && bun x tsc --noEmit -p tsconfig.web.json',
};

/*** Write the author-owned manifest facts that prove target sources, artifacts, and build ownership. */
async function writePackageAsync(
  target: string,
  exports: Record<string, Record<string, string>>,
  scripts: Record<string, string> = defaultScripts,
): Promise<void> {
  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify({ exports, scripts }, null, 2)}\n`,
  );
}

/*** Write complete authored repository metadata around one build declaration under test. */
async function writeMetadataAsync(
  target: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  await writeFile(
    join(target, 'src/metadata/repository.json'),
    `${JSON.stringify({ schemaVersion: 1, kind: 'library', title: 'Fixture', summary: 'Fixture metadata.', purpose: 'Verify target synchronization.', ...metadata }, null, 2)}\n`,
  );
}
