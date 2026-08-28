import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

import { describe, expect, test } from 'bun:test';

describe('Renovate configuration', () => {
  test('activates the Devtools owner profile', async () => {
    const source = await readFile(new URL('../../renovate.json5', import.meta.url), 'utf8');

    expect(source).toContain('github>ankhorage/renovate:devtools-owner');
    expect(source).toContain("managerFilePatterns: ['/^src\\\\/policy\\\\/bunRuntimePolicy");
    expect(source).toContain('Devtools-owned toolchain');
    expect(source).toContain('automerge: false');
    expect(source).toContain("matchUpdateTypes: ['major']");
  });

  test('escapes inherited default-deny only for the canonical Bun authority', async () => {
    const config = await readRenovateConfig();
    const inheritedRules: RenovatePackageRule[] = [
      { matchPackageNames: ['*'], enabled: false },
      {
        matchManagers: ['bun'],
        matchFileNames: ['package.json'],
        enabled: true,
      },
    ];
    const rules = [...inheritedRules, ...config.packageRules];

    expect(resolveEnabled(rules, bunAuthorityDependency)).toBe(true);
    expect(
      resolveEnabled(rules, {
        ...bunAuthorityDependency,
        fileName: 'src/otherPolicy.ts',
      }),
    ).toBe(false);
  });
});

interface RenovateConfig {
  packageRules: RenovatePackageRule[];
}

interface RenovateDependency {
  datasource: string;
  depName: string;
  fileName: string;
  manager: string;
}

interface RenovatePackageRule {
  enabled?: boolean;
  matchDatasources?: string[];
  matchDepNames?: string[];
  matchFileNames?: string[];
  matchManagers?: string[];
  matchPackageNames?: string[];
}

const bunAuthorityDependency: RenovateDependency = {
  datasource: 'npm',
  depName: 'bun',
  fileName: 'src/policy/bunRuntimePolicy.ts',
  manager: 'custom.regex',
};

async function readRenovateConfig(): Promise<RenovateConfig> {
  const source = await readFile(new URL('../../renovate.json5', import.meta.url), 'utf8');

  return runInNewContext(`(${source})`) as RenovateConfig;
}

function resolveEnabled(rules: RenovatePackageRule[], dependency: RenovateDependency): boolean {
  return rules.reduce(
    (enabled, rule) => (matchesDependency(rule, dependency) ? (rule.enabled ?? enabled) : enabled),
    true,
  );
}

function matchesDependency(rule: RenovatePackageRule, dependency: RenovateDependency): boolean {
  return (
    matches(rule.matchDatasources, dependency.datasource) &&
    matches(rule.matchDepNames, dependency.depName) &&
    matches(rule.matchPackageNames, dependency.depName) &&
    matches(rule.matchFileNames, dependency.fileName) &&
    matches(rule.matchManagers, dependency.manager)
  );
}

function matches(patterns: string[] | undefined, value: string): boolean {
  return patterns === undefined || patterns.includes('*') || patterns.includes(value);
}
