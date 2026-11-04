import { expect, test } from 'bun:test';

import { planCiImpact } from './files/ci-impact.js';

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
    mode: 'changed', scripts: ['test'], reason: 'Bun transitive import graph',
  });
  expect(result.e2e.scripts).toEqual(['test:e2e:auth']);
  expect(result.e2e.mode).toBe('scoped');
  expect(result.smoke.scripts).toEqual(['test:smoke:auth']);
  expect(result.smoke.mode).toBe('scoped');
});

test('source shared by several suites schedules all dependent E2E suites', () => {
  const result = planCiImpact([
    'src/features/auth/login.ts', 'src/features/catalog/search.ts',
  ], scripts, config, base);
  expect(result.e2e.mode).toBe('scoped');
  expect(result.e2e.scripts).toEqual(['test:e2e:auth', 'test:e2e:catalog']);
  expect(result.smoke.mode).toBe('full');
});

test('unknown source impact triggers complete E2E and smoke suites', () => {
  const result = planCiImpact(['src/utils/shared.ts'], scripts, config, base);
  expect(result.unit.mode).toBe('changed');
  expect(result.e2e).toEqual({
    mode: 'full', scripts: ['test:e2e'], reason: 'Unmapped changed file',
  });
  expect(result.smoke.scripts).toEqual(['test:smoke']);
});

test('global metadata, setup and workflow changes trigger complete suites', () => {
  for (const path of ['package.json', 'bun.lock', '.github/workflows/ci.yml',
    '.agents/skills/ankhorage-coding-rules/SKILL.md', 'scripts/setup.ts']) {
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
  expect(planCiImpact(file, scripts, { ...config, complete: { e2e: false, smoke: false } }, base).smoke.mode).toBe('full');
});

test('other unit runners are not silently interpreted as Bun tests', () => {
  const result = planCiImpact(['src/features/auth/login.ts'], {
    ...scripts, test: 'vitest run',
  }, config, base);
  expect(result.unit.mode).toBe('full');
});

test('repositories without test scripts omit absent checks', () => {
  const result = planCiImpact(['src/features/auth/login.ts'], {}, undefined, base);
  expect(result.unit.mode).toBe('skip');
  expect(result.e2e.mode).toBe('skip');
  expect(result.smoke.mode).toBe('skip');
});
