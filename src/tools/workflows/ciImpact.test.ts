import { expect, test } from 'bun:test';

import { createCiImpactWorkflowOutput, planCiImpact } from '../../ci-impact.js';

const base = 'a'.repeat(40);
const scripts = {
  test: 'bun test',
  'test:e2e': 'playwright test',
  'test:smoke': 'bun test ./smoke',
  'test:e2e:auth': 'playwright test e2e/auth',
  'test:e2e:catalog': 'playwright test e2e/catalog',
  'test:smoke:auth': 'bun test ./smoke/auth',
} as const;
const config = {
  complete: { e2e: true, smoke: true },
  suites: [
    { kind: 'e2e', script: 'test:e2e:auth', paths: ['src/features/auth/**', 'e2e/auth/**'] },
    { kind: 'e2e', script: 'test:e2e:catalog', paths: ['src/features/catalog/**'] },
    { kind: 'smoke', script: 'test:smoke:auth', paths: ['src/features/auth/**'] },
  ],
} as const;

test('documentation-only changes skip unit, E2E and smoke suites', () => {
  const result = planCiImpact(['docs/guide.md', '.changeset/ci.md'], scripts, config, base);
  expect(result.unit.mode).toBe('skip');
  expect(result.e2e.mode).toBe('skip');
  expect(result.smoke.mode).toBe('skip');
});

test('isolated source changes select Bun graph and explicitly owned E2E and smoke suites', () => {
  const result = planCiImpact(['src/features/auth/login.ts'], scripts, config, base);
  expect(result.unit).toEqual({
    mode: 'changed',
    scripts: ['test'],
    reason: 'Bun transitive import graph',
  });
  expect(result.e2e.scripts).toEqual(['test:e2e:auth']);
  expect(result.e2e.mode).toBe('scoped');
  expect(result.smoke.scripts).toEqual(['test:smoke:auth']);
  expect(result.smoke.mode).toBe('scoped');
});

test('source shared by several suites schedules all dependent E2E suites', () => {
  const result = planCiImpact(
    ['src/features/auth/login.ts', 'src/features/catalog/search.ts'],
    scripts,
    config,
    base,
  );
  expect(result.e2e.mode).toBe('scoped');
  expect(result.e2e.scripts).toEqual(['test:e2e:auth', 'test:e2e:catalog']);
  expect(result.smoke.mode).toBe('full');
});

test('unknown source impact triggers complete E2E and smoke suites', () => {
  const result = planCiImpact(['src/utils/shared.ts'], scripts, config, base);
  expect(result.unit.mode).toBe('changed');
  expect(result.e2e).toEqual({
    mode: 'full',
    scripts: ['test:e2e'],
    reason: 'Ambiguous or unmapped changed file',
  });
  expect(result.smoke.scripts).toEqual(['test:smoke']);
});

test('public workflow output selects individual scripts without an inferred pass', () => {
  const output = createCiImpactWorkflowOutput(
    planCiImpact(['src/features/auth/login.ts'], scripts, config, base),
    config,
  );

  expect(output).toMatchObject({
    version: 1,
    jobs: {
      'test:e2e:auth': {
        state: 'selected',
        reason: 'Explicit complete suite mapping',
        fallback: false,
      },
      'test:e2e:catalog': {
        state: 'skipped',
        reason: 'Explicit complete suite mapping',
        fallback: false,
      },
      'test:smoke:auth': {
        state: 'selected',
        reason: 'Explicit complete suite mapping',
        fallback: false,
      },
    },
  });
});

test('public workflow output marks every declared script as a full fallback when mapping is unsafe', () => {
  const output = createCiImpactWorkflowOutput(planCiImpact(null, scripts, config, ''), config);

  expect(output.jobs).toEqual({
    'test:e2e:auth': {
      state: 'full',
      reason: 'Unsafe or unavailable diff',
      fallback: true,
    },
    'test:e2e:catalog': {
      state: 'full',
      reason: 'Unsafe or unavailable diff',
      fallback: true,
    },
    'test:smoke:auth': {
      state: 'full',
      reason: 'Unsafe or unavailable diff',
      fallback: true,
    },
  });
});

test('ambiguous suite ownership and configuration files retain the complete fallback', () => {
  const ambiguous = {
    ...config,
    suites: [
      ...config.suites,
      { kind: 'e2e' as const, script: 'test:e2e:catalog', paths: ['src/features/auth/**'] },
    ],
  };

  expect(planCiImpact(['src/features/auth/login.ts'], scripts, ambiguous, base).e2e.mode).toBe(
    'full',
  );
  expect(planCiImpact(['src/runtime.config.ts'], scripts, config, base).smoke.mode).toBe('full');
  expect(planCiImpact(['yarn.lock'], scripts, config, base).e2e.mode).toBe('full');
});

test('global metadata, setup and workflow changes trigger complete suites', () => {
  for (const path of [
    'package.json',
    'bun.lock',
    '.github/workflows/ci.yml',
    '.agents/skills/ankhorage-coding-rules/SKILL.md',
    'scripts/setup.ts',
  ]) {
    const result = planCiImpact([path], scripts, config, base);
    expect(result.unit.mode).toBe('full');
    expect(result.e2e.mode).toBe('full');
    expect(result.smoke.mode).toBe('full');
  }
});

test('missing or invalid diff fails closed and runs all declared suites', () => {
  const result = planCiImpact(null, scripts, config, '');
  expect(result.unit.mode).toBe('full');
  expect(result.e2e.mode).toBe('full');
  expect(result.smoke.mode).toBe('full');
});

test('absent or incomplete mapping never prunes E2E and smoke suites', () => {
  const file = ['src/features/auth/login.ts'];
  expect(planCiImpact(file, scripts, undefined, base).e2e.mode).toBe('full');
  expect(
    planCiImpact(file, scripts, { ...config, complete: { e2e: false, smoke: false } }, base).smoke
      .mode,
  ).toBe('full');
});

test('other unit runners are not silently interpreted as Bun tests', () => {
  const result = planCiImpact(
    ['src/features/auth/login.ts'],
    {
      ...scripts,
      test: 'vitest run',
    },
    config,
    base,
  );
  expect(result.unit.mode).toBe('full');
});

test('repositories without test scripts omit absent checks', () => {
  const result = planCiImpact(['src/features/auth/login.ts'], {}, undefined, base);
  expect(result.unit.mode).toBe('skip');
  expect(result.e2e.mode).toBe('skip');
  expect(result.smoke.mode).toBe('skip');
});
