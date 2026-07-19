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
    scripts: {
      test: 'bun test',
      lint: 'ankhorage-eslint . --max-warnings=0',
    },
    devDependencies: {
      typescript: '^5.9.3',
      '@ankhorage/devtools': '^2.3.4',
    },
  });
  expect(readNestedValue(updated, 'devDependencies', 'eslint')).toBeUndefined();
});

test('detects managed package drift without caring about unrelated fields', () => {
  const manifest = applyManagedPackageContract({ name: 'fixture', private: true }, '2.3.4');
  expect(isManagedPackageContractCurrent(manifest, '2.3.4')).toBe(true);
  expect(isManagedPackageContractCurrent({ ...manifest, private: false }, '2.3.4')).toBe(true);
  expect(isManagedPackageContractCurrent(manifest, '2.3.5')).toBe(false);
});

test('does not apply the consumer contract to devtools itself', () => {
  const manifest = {
    name: '@ankhorage/devtools',
    dependencies: { eslint: '^10.2.0' },
  };
  expect(applyManagedPackageContract(manifest, '2.3.4')).toEqual(manifest);
  expect(isManagedPackageContractCurrent(manifest, '2.3.4')).toBe(true);
});

function readNestedValue(
  object: Record<string, unknown>,
  property: string,
  nestedProperty: string,
): unknown {
  const nested = object[property];
  return isRecord(nested) ? nested[nestedProperty] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
