import type { ApmUpdateDescriptor } from '@ankhorage/apm/types';

/*** Construct a supported owner history without requiring a migration script for every release. */
export function descriptor(): ApmUpdateDescriptor {
  return {
    protocolVersion: 1,
    schemaVersion: 1,
    owner: { name: 'apm-owner-fixture', version: '2.0.0' },
    history: {
      supported: [{ sourceRange: '>=1.0.0 <3.0.0', mode: 'no-migration' }],
      unsupported: [{ sourceRange: '<1.0.0', reason: 'Manual upgrade required.' }],
      downgrade: 'unsupported',
    },
    compatibility: [],
    migrations: [],
    projections: [],
    effects: [],
  };
}

/*** Describe a single package-owned projection requiring executable handlers. */
export function projectionDescriptor(): ApmUpdateDescriptor {
  return {
    ...descriptor(),
    projections: [
      {
        id: 'fixture-projection',
        claims: [{ kind: 'file', path: 'generated.json' }],
        requiresExtension: true,
        reason: 'Fixture generation policy.',
      },
    ],
    extension: { export: './apm' },
  };
}

/*** Construct an immutable candidate for source-level validator tests. */
export function candidate(value: ApmUpdateDescriptor) {
  return {
    packageJson: manifest(),
    descriptor: value,
    descriptorSource: JSON.stringify(value),
    integrity: 'sha512-fixture',
  };
}

/*** Build a published package fixture with intentional script and conditional-export coverage. */
export function manifest() {
  return {
    name: 'apm-owner-fixture',
    version: '2.0.0',
    type: 'module',
    files: ['apm', 'dist'],
    ankh: { apm: { protocolVersion: 1, descriptor: './apm/update.json' } },
    exports: {
      './apm': {
        types: './dist/apm.d.ts',
        node: { import: './dist/apm.js' },
        default: './dist/apm.js',
      },
    },
    scripts: { prepack: "node -e \"require('node:fs').writeFileSync('lifecycle-ran', 'yes')\"" },
  };
}
