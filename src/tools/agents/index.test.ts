import { lstat, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { syncManagedFiles } from '../shared/managedFiles.js';
import { agentsManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('managed AGENTS.md renders package identity and current architecture policy', async () => {
  const target = await createTarget({
    name: '@ankhorage/example',
    description: 'Example package.',
  });

  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
    { relativePath: 'AGENTS.md', action: 'created' },
    { relativePath: 'CLAUDE.md', action: 'created' },
    { relativePath: 'GEMINI.md', action: 'created' },
  ]);
  const contents = await readFile(join(target, 'AGENTS.md'), 'utf8');
  expect(contents).toContain('Package: `@ankhorage/example`');
  expect(contents).toContain('Example package.');
  expect(contents).toContain('Only the current Ankhorage architecture is valid.');
  expect(contents).toContain('Do not add or retain deprecated APIs');
  expect(contents).toContain('Every repository managed by `@ankhorage/devtools` is standalone.');
  expect(contents).toContain('consumer-agnostic and reusable outside Ankhorage');
  expect(contents).toContain('architecture debt to remove, not');
  expect(contents).not.toContain('AGENTS.override.md');
  expect((await lstat(join(target, 'CLAUDE.md'))).isSymbolicLink()).toBe(true);
  expect((await lstat(join(target, 'GEMINI.md'))).isSymbolicLink()).toBe(true);
  expect(await readlink(join(target, 'CLAUDE.md'))).toBe('AGENTS.md');
  expect(await readlink(join(target, 'GEMINI.md'))).toBe('AGENTS.md');
});

test('managed AGENTS.md renders contextual skill, documentation, and delivery instructions', async () => {
  const target = await createTarget({ name: '@ankhorage/example' });
  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  const contents = await readFile(join(target, 'AGENTS.md'), 'utf8');

  expect(contents).toContain('Before changing any file, read this `AGENTS.md` completely');
  expect(contents).toContain('Treat skill selection as a mandatory precondition to editing');
  expect(contents).toContain('.agents/skills/ankhorage-coding-rules/SKILL.md');
  expect(contents).toContain('.agents/skills/ankhorage-project-structure/SKILL.md');
  expect(contents).toContain('These rules define mandatory minimums');
  expect(contents).toContain('allow-list; do not skip a useful relevant skill');
  expect(contents).toContain('If the task scope expands, inspect');
  expect(contents).toContain('`.agents/skills/` again and load the newly relevant skills');
  expect(contents).toContain(
    '`README.md` and the configured Paradox output are generated release artifacts',
  );
  expect(contents).toContain('do not regenerate or commit them in ordinary feature pull requests');
  expect(contents).toContain('leading `@usage` comments in real');
  expect(contents).toContain('`examples/<example>/...` source files');
  expect(contents).toContain(
    'The managed release workflow runs `bun run docs` after the package version bump',
  );
  expect(contents).toContain(
    `Before creating a pull request, run all of these commands in this order and resolve every failure:

\`\`\`sh
bun run build
bun run check-types
bun run lint
bun run knip:check
bun run changeset
bun run format
\`\`\``,
  );
  expect(contents).not.toContain('bun run knip:test');
  expect(contents).toContain('Scripts inside an Agent Skill must always be TypeScript files');
  expect(contents).toContain('`.js`, `.mjs`, or `.cjs` are not allowed');
});

test('managed AGENTS.md updates package identity and handles missing identity truthfully', async () => {
  const target = await createTarget({});
  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  expect(await readFile(join(target, 'AGENTS.md'), 'utf8')).toContain(
    'Package: `Package name not declared`',
  );

  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify({ name: '@ankhorage/new', description: 'New description.' }, null, 2)}\n`,
  );
  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: true })).toEqual([
    { relativePath: 'AGENTS.md', action: 'would-update' },
    { relativePath: 'CLAUDE.md', action: 'unchanged' },
    { relativePath: 'GEMINI.md', action: 'unchanged' },
  ]);
});

async function createTarget(manifest: Record<string, unknown>): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-agents-');
  temporaryDirectories.push(target);
  await writeFile(join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}
