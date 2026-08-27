import { expect, test } from 'bun:test';

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
    packageManager: 'bun@1.3.14',
    scripts: {
      test: 'bun test',
      lint: 'ankhorage-eslint . --max-warnings=0',
      'knip:check': 'ankhorage-knip',
    },
    devDependencies: {
      typescript: '^5.9.3',
      '@ankhorage/devtools': '^2.3.4',
      '@types/bun': '^1.3.14',
    },
  });
  expect(readNestedValue(updated, 'devDependencies', 'eslint')).toBeUndefined();
  expect(readNestedValue(updated, 'scripts', 'knip')).toBeUndefined();
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
    packageManager: 'bun@1.3.14',
    dependencies: {
      '@ankhorage/devtools': '^2.3.4',
      yaml: '^2.8.1',
    },
    devDependencies: {
      typescript: '^5.9.3',
      '@types/bun': '^1.3.14',
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
    isManagedPackageContractCurrent({ ...manifest, packageManager: 'bun@1.3.13' }, '2.3.4'),
  ).toBe(false);
  expect(
    isManagedPackageContractCurrent(
      {
        ...manifest,
        devDependencies: {
          ...readNestedRecord(manifest, 'devDependencies'),
          '@types/bun': '^1.3.13',
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
    packageManager: 'bun@1.3.14',
    dependencies: { eslint: '^10.2.0' },
    scripts: { lint: 'eslint .' },
    devDependencies: { '@types/bun': '^1.3.14' },
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
