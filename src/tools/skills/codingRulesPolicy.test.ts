import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

const canonicalSkillUrl = new URL('./assets/ankhorage-coding-rules/SKILL.md', import.meta.url);

test('coding rules require canonical Paradox comments and policy-owned tags', async () => {
  const contents = await readFile(canonicalSkillUrl, 'utf8');

  expect(contents).toContain('every named production function under `src`');
  expect(contents).toContain('Paradox `/*** ... */` comment');
  expect(contents).toContain('`@readme`, `@usage`, `@config`, `@title`');
  expect(contents).toContain('`@see`, and `@security`');
  expect(contents).toContain('Unsupported tag-shaped lines are invalid');
  expect(contents).toContain('`@example` does not exist');
  expect(contents).toContain('Do not use JSDoc-only tags such as');
  expect(contents).toContain('`@param` or `@returns` as Paradox metadata');
});

test('coding rules keep README usage owned by runnable examples', async () => {
  const contents = await readFile(canonicalSkillUrl, 'utf8');

  expect(contents).toContain('repository-root `examples/<example>/...` source');
  expect(contents).toContain('exactly one example combining `@usage`');
  expect(contents).toContain('`@readme`, and `@title`');
  expect(contents).toContain('Do not create');
  expect(contents).toContain('dedicated `readme-usage`');
});

test('coding rules prohibit embedded code and fake config surfaces', async () => {
  const contents = await readFile(canonicalSkillUrl, 'utf8');

  expect(contents).toContain('Fenced or indented code blocks are');
  expect(contents).toContain('source examples come from real code');
  expect(contents).toContain('Configuration documentation is optional until a package opts in');
  expect(contents).toContain('canonical schema');
  expect(contents).toContain('`src/types/config.ts`');
});
