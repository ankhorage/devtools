import { expect, test } from 'bun:test';

import { bunRuntimePolicy } from '../../policy/bunRuntimePolicy.js';
import { applyManagedPackageContract, isManagedPackageContractCurrent } from './index.js';

test('merges standard scripts and the shared devtools dependency', () => {
  const updated = applyManagedPackageContract(
    {
      name: 'fixture',
      scripts: { test: 'bun test' },
      devDependencies: { eslint: '^10.0.0', typescript: '^5.9.3' },
    },
    '2.3.4',
  );

  expect(updated).toMatchObject({
    packageManager: bunRuntimePolicy.packageManager,
    scripts: {
      test: 'bun test',
      lint: 'ankhorage-eslint . --max-warnings=0',
      'knip:check': 'ankhorage-knip',
    },
    devDependencies: {
      typescript: '^5.9.3',
      '@ankhorage/devtools': '^2.3.4',
      '@types/bun': bunRuntimePolicy.typesRange,
    },
  });
  expect(readNestedValue(updated, 'devDependencies', 'eslint')).toBeUndefined();
  expect(readNestedValue(updated, 'scripts', 'knip')).toBeUndefined();
  expect(readNestedValue(updated, 'scripts', 'changeset')).toBeUndefined();
});

test('centralizes Changesets for repositories with config or release scripts', () => {
  const fixtures = [
    {
      manifest: {
        name: 'configured-fixture',
        dependencies: { '@changesets/cli': '^2.30.0' },
      },
      changesetsConfigExists: true,
    },
    {
      manifest: {
        name: 'scripted-fixture',
        scripts: { 'version-packages': 'changeset version' },
        devDependencies: { '@changesets/cli': '^2.31.0' },
      },
      changesetsConfigExists: false,
    },
  ] as const;

  for (const fixture of fixtures) {
    const updated = applyManagedPackageContract(
      fixture.manifest,
      '2.3.4',
      fixture.changesetsConfigExists,
    );

    expect(updated).toMatchObject({
      scripts: {
        changeset: 'ankhorage-changeset',
        'changeset:status': 'ankhorage-changeset status --since=origin/main',
        'version-packages': 'ankhorage-changeset version',
      },
    });
    expect(readNestedValue(updated, 'dependencies', '@changesets/cli')).toBeUndefined();
    expect(readNestedValue(updated, 'devDependencies', '@changesets/cli')).toBeUndefined();
    expect(isManagedPackageContractCurrent(updated, '2.3.4', true)).toBe(true);
  }
});

test('detects Changesets dependency and script drift', () => {
  const manifest = applyManagedPackageContract(
    { name: 'fixture', scripts: { changeset: 'changeset' } },
    '2.3.4',
  );

  expect(isManagedPackageContractCurrent(manifest, '2.3.4')).toBe(true);
  expect(
    isManagedPackageContractCurrent(
      {
        ...manifest,
        devDependencies: {
          ...readNestedRecord(manifest, 'devDependencies'),
          '@changesets/cli': '^2.31.1',
        },
      },
      '2.3.4',
    ),
  ).toBe(false);
  expect(
    isManagedPackageContractCurrent(
      {
        ...manifest,
        scripts: {
          ...readNestedRecord(manifest, 'scripts'),
          'changeset:status': 'changeset status --since=origin/main',
        },
      },
      '2.3.4',
    ),
  ).toBe(false);
});

test('removes the obsolete knip script that conflicts with the installed binary', () => {
  const updated = applyManagedPackageContract(
    {
      name: 'fixture',
      scripts: { knip: 'ankhorage-knip' },
    },
    '2.3.4',
  );

  expect(readNestedValue(updated, 'scripts', 'knip')).toBeUndefined();
  expect(readNestedValue(updated, 'scripts', 'knip:check')).toBe('ankhorage-knip');
  expect(isManagedPackageContractCurrent(updated, '2.3.4')).toBe(true);
});

test('preserves devtools as a runtime dependency for ankh', () => {
  const updated = applyManagedPackageContract(
    {
      name: '@ankhorage/ankh',
      dependencies: {
        '@ankhorage/devtools': '^1.2.1',
        yaml: '^2.8.1',
      },
      devDependencies: {
        '@ankhorage/devtools': '^1.2.1',
        eslint: '^10.0.0',
        typescript: '^5.9.3',
      },
    },
    '2.3.4',
  );

  expect(updated).toMatchObject({
    packageManager: bunRuntimePolicy.packageManager,
    dependencies: {
      '@ankhorage/devtools': '^2.3.4',
      yaml: '^2.8.1',
    },
    devDependencies: {
      typescript: '^5.9.3',
      '@types/bun': bunRuntimePolicy.typesRange,
    },
  });
  expect(readNestedValue(updated, 'devDependencies', '@ankhorage/devtools')).toBeUndefined();
  expect(readNestedValue(updated, 'devDependencies', 'eslint')).toBeUndefined();
  expect(isManagedPackageContractCurrent(updated, '2.3.4')).toBe(true);
});

test('detects incorrect devtools dependency placement for ankh', () => {
  const manifest = applyManagedPackageContract({ name: '@ankhorage/ankh' }, '2.3.4');
  const misplaced = {
    ...manifest,
    dependencies: {},
    devDependencies: {
      ...readNestedRecord(manifest, 'devDependencies'),
      '@ankhorage/devtools': '^2.3.4',
    },
  };

  expect(isManagedPackageContractCurrent(misplaced, '2.3.4')).toBe(false);
});

test('detects managed package drift without caring about unrelated fields', () => {
  const manifest = applyManagedPackageContract({ name: 'fixture', private: true }, '2.3.4');
  expect(isManagedPackageContractCurrent(manifest, '2.3.4')).toBe(true);
  expect(isManagedPackageContractCurrent({ ...manifest, private: false }, '2.3.4')).toBe(true);
  expect(isManagedPackageContractCurrent(manifest, '2.3.5')).toBe(false);
  expect(
    isManagedPackageContractCurrent({ ...manifest, packageManager: 'bun@0.0.0' }, '2.3.4'),
  ).toBe(false);
  expect(
    isManagedPackageContractCurrent(
      {
        ...manifest,
        devDependencies: {
          ...readNestedRecord(manifest, 'devDependencies'),
          '@types/bun': '^0.0.0',
        },
      },
      '2.3.4',
    ),
  ).toBe(false);
});

test('applies only the Bun policy to devtools itself', () => {
  const manifest = {
    name: '@ankhorage/devtools',
    dependencies: { eslint: '^10.2.0' },
    scripts: { lint: 'eslint .' },
  };
  const updated = applyManagedPackageContract(manifest, '2.3.4');

  expect(updated).toMatchObject({
    name: '@ankhorage/devtools',
    packageManager: bunRuntimePolicy.packageManager,
    dependencies: { eslint: '^10.2.0' },
    scripts: { lint: 'eslint .' },
    devDependencies: { '@types/bun': bunRuntimePolicy.typesRange },
  });
  expect(isManagedPackageContractCurrent(updated, '2.3.4')).toBe(true);
});

function readNestedValue(
  object: Record<string, unknown>,
  property: string,
  nestedProperty: string,
): unknown {
  const nested = object[property];
  return isRecord(nested) ? nested[nestedProperty] : undefined;
}

function readNestedRecord(
  object: Record<string, unknown>,
  property: string,
): Record<string, unknown> {
  const nested = object[property];
  return isRecord(nested) ? nested : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
