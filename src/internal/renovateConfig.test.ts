import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

import { describe, expect, test } from 'bun:test';

describe('Renovate configuration', () => {
  test('activates the Devtools owner profile without duplicating runtime policy ownership', async () => {
    const source = await readFile(new URL('../../renovate.json5', import.meta.url), 'utf8');
    const config = await readRenovateConfig();

    expect(source).toContain('github>ankhorage/renovate:devtools-owner');
    expect(source).toContain('Canonical runtime policy literals are updated in ankhorage/policy');
    expect(source).not.toContain('bunRuntimePolicy.ts');
    expect(config.customManagers).toBeUndefined();
  });

  test('defers TypeScript 7 until the ESLint parser supports its compiler API', async () => {
    const config = await readRenovateConfig();
    const typescriptRule = config.packageRules.find((rule) =>
      rule.matchDepNames?.includes('typescript'),
    );

    expect(typescriptRule?.allowedVersions).toBe('<7.0.0');
    expect(typescriptRule?.matchDepNames).toEqual(['typescript']);
  });
});

interface RenovateConfig {
  customManagers?: unknown[];
  packageRules: RenovatePackageRule[];
}

interface RenovatePackageRule {
  allowedVersions?: string;
  matchDepNames?: string[];
}

async function readRenovateConfig(): Promise<RenovateConfig> {
  const source = await readFile(new URL('../../renovate.json5', import.meta.url), 'utf8');
  return runInNewContext(`(${source})`) as RenovateConfig;
}
