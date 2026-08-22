/**
 * Canonical runtime/tooling policies for Ankhorage repositories.
 *
 * Import these from `@ankhorage/devtools/policy` when another package needs to inspect
 * the managed Bun or Node baseline without defining an independent version authority.
 */
export const bunRuntimePolicy = {
  packageManager: 'bun@1.3.14',
  typesRange: '^1.3.14',
  version: '1.3.14',
} as const;

/**
 * Canonical Node LTS baseline for Node-based Ankhorage tooling and CI execution.
 *
 * Bun remains the repository package manager/primary command runtime where configured;
 * this policy makes Node-based tooling deterministic instead of inheriting the ambient
 * Node version from a CI runner image.
 */
export const nodeRuntimePolicy = {
  engineRange: '24.x',
  major: 24,
  setupVersion: '24',
} as const;
