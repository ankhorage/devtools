import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

const canonicalSkillUrl = new URL('./assets/ankhorage-coding-rules/SKILL.md', import.meta.url);

test('coding rules require canonical Paradox comments and tags', async () => {
  const contents = await readFile(canonicalSkillUrl, 'utf8');

  expect(contents).toContain('every named production function under `src`');
  expect(contents).toContain('Paradox `/*** ... */` comment');
  expect(contents).toContain('`@readme`, `@config`, `@example`, and `@usage`');
  expect(contents).toContain('Do not use JSDoc-only tags such as');
  expect(contents).toContain('`@param` or `@returns` as Paradox metadata');
});

test('coding rules keep README usage owned by runnable examples', async () => {
  const contents = await readFile(canonicalSkillUrl, 'utf8');

  expect(contents).toContain('repository-root `examples/<example>/...` source');
  expect(contents).toContain("Put `@usage` in that example file's leading `/*** ... */` comment");
  expect(contents).toContain('Do not create dedicated `readme-usage`');
  expect(contents).toContain('`usage-readme`, `readmeUsage`, or equivalent source modules');
});
