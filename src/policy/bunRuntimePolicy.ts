/**
 * Canonical Bun runtime policy for Ankhorage repositories.
 *
 * Import this from `@ankhorage/devtools/policy` when another package needs to inspect
 * the managed Bun version without defining an independent version authority.
 */
export const bunRuntimePolicy = {
  packageManager: 'bun@1.3.14',
  typesRange: '^1.3.14',
  version: '1.3.14',
} as const;
