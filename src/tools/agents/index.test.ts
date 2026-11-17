import { lstat, mkdir, mkdtemp, readFile, readlink, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import {
  inspectManagedFiles,
  syncManagedFiles,
} from '../../features/managed-files/managedFiles.js';
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
  expect(contents).toContain(
    '<!-- This file is managed by @ankhorage/devtools. -->\n\n## Repository',
  );
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

test('managed AGENTS.md preserves Next.js-owned instructions idempotently', async () => {
  const target = await createTarget({ name: 'next-fixture', dependencies: { next: '16.4.6' } });
  const nextBlock = `<!-- BEGIN:nextjs-agent-rules -->\n\n## Next.js guidance\n\n<!-- END:nextjs-agent-rules -->`;
  await writeFile(join(target, 'AGENTS.md'), `${nextBlock}\n`);

  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  expect(await readFile(join(target, 'AGENTS.md'), 'utf8')).toContain(nextBlock);
  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
    { relativePath: 'AGENTS.md', action: 'unchanged' },
    { relativePath: 'CLAUDE.md', action: 'unchanged' },
    { relativePath: 'GEMINI.md', action: 'unchanged' },
  ]);
});

test('managed AGENTS.md preserves CRLF Next.js instructions through sync and status', async () => {
  const target = await createTarget({ name: 'next-fixture', dependencies: { next: '16.4.6' } });
  const nextBlock = [
    '<!-- BEGIN:nextjs-agent-rules -->',
    '',
    '## Next.js guidance',
    '',
    '<!-- END:nextjs-agent-rules -->',
  ].join('\r\n');
  await writeFile(join(target, 'AGENTS.md'), `${nextBlock}\r\n`);

  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  expect(await readFile(join(target, 'AGENTS.md'), 'utf8')).toContain(nextBlock);
  expect(await inspectManagedFiles(target, agentsManagedFiles)).toEqual([
    { relativePath: 'AGENTS.md', state: 'current' },
    { relativePath: 'CLAUDE.md', state: 'current' },
    { relativePath: 'GEMINI.md', state: 'current' },
  ]);
  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
    { relativePath: 'AGENTS.md', action: 'unchanged' },
    { relativePath: 'CLAUDE.md', action: 'unchanged' },
    { relativePath: 'GEMINI.md', action: 'unchanged' },
  ]);
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
  expectGitHubTaskLifecycleInstructions(contents);
  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
    { relativePath: 'AGENTS.md', action: 'unchanged' },
    { relativePath: 'CLAUDE.md', action: 'unchanged' },
    { relativePath: 'GEMINI.md', action: 'unchanged' },
  ]);
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
  expect(contents).toContain('No Changeset means no release is requested.');
  expect(contents).toContain('Never add an empty Changeset to satisfy CI');
  expect(contents).not.toContain('bun run knip:test');
  expect(contents).toContain('Scripts inside an Agent Skill must always be TypeScript files');
  expect(contents).toContain('`.js`, `.mjs`, or `.cjs` are not allowed');
});

/*** Assert that managed instructions contain the complete GitHub task lifecycle policy once. */
function expectGitHubTaskLifecycleInstructions(contents: string): void {
  expect(contents.match(/## GitHub task lifecycle and workspace cleanup/gu)).toHaveLength(1);
  expect(contents).toContain(
    'Treat each issue implementation, PR implementation, review, and change request',
  );
  expect(contents).toContain(
    'Concurrent tasks must have distinct writable checkout, temporary, build, and cache paths.',
  );
  expect(contents).toContain(
    'Fetch and check out the current remote PR branch in the new workspace.',
  );
  expect(contents).toContain('GitHub has the intended commit on the correct remote branch.');
  expect(contents).toContain('Report acceptance that was not run as unverified.');
  expect(contents).toContain('resolve every candidate path and remove only task-owned directories');
  expect(contents).toContain('resolved system path for `/tmp` (`/private/tmp` on');
  expect(contents).toContain(
    'Refuse candidates that resolve outside that boundary, including through a symlink.',
  );
  expect(contents).toContain('Git-aware removal for worktrees.');
  expect(contents).toContain('Preserve workspaces outside the boundary, shared directories');
}

test('managed AGENTS.md renders validated source metadata without consulting README content', async () => {
  const target = await createTarget({
    name: '@ankhorage/example',
    description: 'Generic manifest description.',
  });
  await writeRepositoryMetadata(target, 'source', {
    ...validMetadata,
    title: 'Example `tool`',
    summary: 'Coordinates *trusted* <tasks>.',
    audience: ['Maintainers [and] integrators.'],
    boundaries: ['Does not own _deployment_.'],
    responsibilities: ['Render canonical agent guidance.'],
    architecture: {
      role: 'Tooling edge over authored metadata.',
      invariants: ['Never execute repository-owned code.'],
    },
  });
  await writeFile(join(target, 'README.md'), 'README content must not become agent guidance.\n');

  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  const contents = await readFile(join(target, 'AGENTS.md'), 'utf8');

  expect(contents).toMatch(/Title: Example \\`tool\\`/u);
  expect(contents).toContain('Coordinates \\*trusted\\* \\<tasks\\>.');
  expect(contents).toContain('- Maintainers \\[and\\] integrators.');
  expect(contents).toContain('## Scope and boundaries');
  expect(contents).toContain('- Does not own \\_deployment\\_.');
  expect(contents).toContain('Architecture role: Tooling edge over authored metadata.');
  expect(contents).toContain('- Never execute repository-owned code.');
  expect(contents).not.toContain('Generic manifest description.');
  expect(contents).not.toContain('README content must not become agent guidance.');
  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
    { relativePath: 'AGENTS.md', action: 'unchanged' },
    { relativePath: 'CLAUDE.md', action: 'unchanged' },
    { relativePath: 'GEMINI.md', action: 'unchanged' },
  ]);
});

test('managed AGENTS.md supports the canonical non-source metadata profile', async () => {
  const target = await createTarget({ name: 'configuration-repository' });
  await writeRepositoryMetadata(target, 'non-source', {
    ...validMetadata,
    kind: 'configuration',
    title: 'Configuration repository',
  });

  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  expect(await readFile(join(target, 'AGENTS.md'), 'utf8')).toContain(
    'Title: Configuration repository',
  );
});

test('managed AGENTS.md rejects invalid present metadata instead of using the fallback', async () => {
  const target = await createTarget({
    name: '@ankhorage/example',
    description: 'Fallback must not hide invalid metadata.',
  });
  await mkdir(join(target, 'src/metadata'), { recursive: true });
  await writeFile(
    join(target, 'src/metadata/repository.json'),
    JSON.stringify({ ...validMetadata, boundaries: 'not-an-array' }),
  );

  let thrownError: unknown;
  try {
    await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  } catch (error) {
    thrownError = error;
  }
  if (!(thrownError instanceof Error)) {
    throw new Error('Expected invalid present metadata to fail managed AGENTS rendering.');
  }
  expect(thrownError.message).toContain(
    'Invalid repository metadata at src/metadata/repository.json',
  );
  expect(await Bun.file(join(target, 'AGENTS.md')).exists()).toBe(false);
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

async function writeRepositoryMetadata(
  target: string,
  profile: 'non-source' | 'source',
  metadata: Record<string, unknown>,
): Promise<void> {
  const directory = profile === 'source' ? join(target, 'src/metadata') : join(target, 'metadata');
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, 'repository.json'), `${JSON.stringify(metadata, null, 2)}\n`);
}

const validMetadata = {
  schemaVersion: 1,
  kind: 'tooling',
  title: 'Example tooling',
  summary: 'Coordinates repository automation.',
  purpose: 'Provide deterministic managed agent guidance.',
};
