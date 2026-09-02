import { expect, test } from 'bun:test';

import { BASELINE_SKILL_NAMES, isZoraDesignerContext, PROFILE_SKILL_NAMES } from './selection.js';

test('selects zora-designer for its owning repositories', () => {
  for (const name of ['@ankhorage/zora', '@ankhorage/templates', '@ankhorage/studio']) {
    expect(isZoraDesignerContext({ name })).toBe(true);
  }
});

test('selects zora-designer for generated-app authoring dependencies', () => {
  expect(
    isZoraDesignerContext({
      name: 'customer-app',
      dependencies: {
        '@ankhorage/runtime': '^8.0.0',
        '@ankhorage/zora': '^4.0.0',
      },
    }),
  ).toBe(true);
});

test('does not select zora-designer for unrelated packages or a lone component dependency', () => {
  expect(isZoraDesignerContext({ name: '@ankhorage/contracts' })).toBe(false);
  expect(
    isZoraDesignerContext({
      name: 'component-preview',
      devDependencies: { '@ankhorage/zora': '^4.0.0' },
    }),
  ).toBe(false);
  expect([...BASELINE_SKILL_NAMES, ...PROFILE_SKILL_NAMES]).toEqual([
    'ankhorage-coding-rules',
    'ankhorage-project-structure',
    'zora-designer',
  ]);
});
