import { createHash } from 'node:crypto';

import { resolveMigrationPath } from '@ankhorage/apm';
import type { ApmUpdateDescriptor } from '@ankhorage/apm/types';
import { expect, test } from 'bun:test';

import { validateApmReleaseCandidate } from '../../../apmRelease.js';
import { candidate, descriptor, projectionDescriptor } from '../apmRelease.fixtures.test.js';

test('missing metadata is inapplicable, not an assertion of migration safety', () => {
  expect(
    validateApmReleaseCandidate({
      packageJson: {},
      descriptor: undefined,
      descriptorSource: '',
      integrity: 'sha512-fixture',
    }),
  ).toMatchObject({ applicable: false, valid: true, blockers: [] });
});

test('accepts explicit no-migration history without executable code', () => {
  expect(validateApmReleaseCandidate(candidate(descriptor()))).toMatchObject({
    applicable: true,
    valid: true,
    blockers: [],
  });
});

test('canonical APM resolves supported skipped versions and blocks unsupported old states', () => {
  const current = descriptor();
  for (const sourceVersion of ['1.0.0', '1.2.0', '1.8.0']) {
    expect(
      resolveMigrationPath({ descriptor: current, sourceVersion, targetVersion: '2.0.0' }),
    ).toMatchObject({ supported: true, noMigrationRequired: true });
  }
  expect(
    resolveMigrationPath({ descriptor: current, sourceVersion: '0.5.0', targetVersion: '2.0.0' })
      .supported,
  ).toBe(false);
});

test('rejects malformed metadata and unsupported protocol, schema and identity', () => {
  const valid = candidate(descriptor());
  for (const invalid of [
    { ...valid, packageJson: { ...valid.packageJson, ankh: { apm: null } } },
    { ...valid, descriptor: { ...descriptor(), protocolVersion: 99 } },
    { ...valid, descriptor: { ...descriptor(), schemaVersion: 99 } },
    {
      ...valid,
      descriptor: { ...descriptor(), owner: { name: 'someone-else', version: '2.0.0' } },
    },
    {
      ...valid,
      descriptor: { ...descriptor(), owner: { name: 'apm-owner-fixture', version: '1.0.0' } },
    },
  ])
    expect(validateApmReleaseCandidate(invalid).valid).toBe(false);
});

test('rejects missing handlers and changed descriptor digest without unsafe coercion', () => {
  const value = candidate(projectionDescriptor());
  for (const extension of [
    undefined,
    {},
    {
      protocolVersion: 1,
      descriptorDigest: valueDigest(value.descriptorSource),
      migrations: [],
      projections: [],
    },
  ]) {
    expect(validateApmReleaseCandidate({ ...value, extension }).valid).toBe(false);
  }
});

test('rejects duplicate projection IDs and conflicting ownership through the canonical validator', () => {
  const source = projectionDescriptor();
  expect(
    validateApmReleaseCandidate(
      candidate({ ...source, projections: [...source.projections, ...source.projections] }),
    ).valid,
  ).toBe(false);
});

test('checks selected artifact integrity even for non-participating packages', () => {
  expect(
    validateApmReleaseCandidate(candidate(descriptor()), { expectedIntegrity: 'sha512-other' })
      .blockers[0],
  ).toContain('integrity-mismatch');
});

/*** Match the protocol's raw-descriptor byte digest. */
function valueDigest(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

test('validates required migration handlers and refuses changed historical checksums', () => {
  const source = migrationDescriptor();
  const value = candidate(source);
  const extension = {
    protocolVersion: 1,
    descriptorDigest: valueDigest(value.descriptorSource),
    migrations: [
      {
        id: 'fixture-migration',
        planAsync: () => Promise.resolve({}),
        executeAsync: () => Promise.resolve({}),
        verifyAsync: () => Promise.resolve({}),
      },
    ],
    projections: [],
  };
  expect(validateApmReleaseCandidate({ ...value, extension }).valid).toBe(true);
  const previous = {
    ...source,
    migrations: source.migrations.map((migration) => ({
      ...migration,
      checksum: 'original-checksum',
    })),
  };
  const changed = validateApmReleaseCandidate(
    { ...value, extension },
    { previousDescriptors: [previous] },
  );
  expect(changed.valid).toBe(false);
  expect(
    changed.blockers.some((blocker) => blocker.startsWith('protocol.migration-checksum-changed:')),
  ).toBe(true);
});

test('canonical validation rejects duplicate migrations and unresolved prerequisites', () => {
  const source = migrationDescriptor();
  const duplicate = { ...source, migrations: [...source.migrations, ...source.migrations] };
  expect(
    validateApmReleaseCandidate(candidate(duplicate)).blockers.some((blocker) =>
      blocker.startsWith('protocol.duplicate-migration-id:'),
    ),
  ).toBe(true);
  const missing = {
    ...source,
    migrations: source.migrations.map((migration) => ({
      ...migration,
      prerequisites: [{ owner: 'missing-owner', migrationId: 'missing' }],
    })),
  };
  expect(
    validateApmReleaseCandidate(candidate(missing)).blockers.some((blocker) =>
      blocker.startsWith('protocol.migration-prerequisite-missing:'),
    ),
  ).toBe(true);
});

/*** Declare a real protocol migration shape for required-code and history validation. */
function migrationDescriptor(): ApmUpdateDescriptor {
  return {
    ...descriptor(),
    history: {
      ...descriptor().history,
      supported: [{ sourceRange: '>=1.0.0 <2.0.0', mode: 'automatic' }],
    },
    migrations: [
      {
        id: 'fixture-migration',
        checksum: 'candidate-checksum',
        from: { packageRange: '>=1.0.0 <2.0.0' },
        to: { packageVersion: '2.0.0' },
        phase: 'post-install',
        implementation: { artifact: 'target' },
        prerequisites: [],
        affectedScopes: [{ kind: 'file', path: 'fixture.json' }],
        sideEffects: ['project-files'],
        verification: [{ kind: 'extension', description: 'Verify fixture state.' }],
        recovery: { idempotent: true, restartable: true, reversible: false },
      },
    ],
    extension: { export: './apm' },
  };
}
