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

test('managed AGENTS.md renders scope-frozen policy with repository identity', async () => {
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
  expect(contents).toContain('The user\'s explicit requirements and acceptance criteria');
  expect(contents).toContain('Only the current Ankhorage architecture is valid.');
  expect(contents).toContain('Never independently expand scope or improvise workarounds.');
  expect(contents).toContain('Architecture and dependencies');
  expect(contents).toContain('No unpublished sibling sources');
  expect(contents).toContain('hidden organization-local state, or implicit deployment assumptions');
  expect(contents).not.toContain('architecture debt to remove, not');
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

test('managed AGENTS.md includes scope, safety, testing, delivery and release rules', async () => {
  const target = await createTarget({ name: '@ankhorage/example' });
  await syncManagedFiles(target, agentsManagedFiles, { dryRun: false });
  const contents = await readFile(join(target, 'AGENTS.md'), 'utf8');

  const requiredInstructions = [
    'Scope is frozen unless the user explicitly changes it.',
    'STOP always means graceful stop:',
    'If implementation requires changes in another repository, STOP.',
    'Never add new dependencies without explicit user approval.',
    'Use `bun update` for authorized existing dependency updates.',
    'Use `--frozen-lockfile` for reproducible CI and release builds.',
    'Never directly edit generated or centrally managed files',
    'Database schema changes, data migrations, destructive operations,',
    'All security findings (P0–P3) are hard blockers.',
    'Report all findings as a prioritized P0–P3 list with evidence.',
    'Create new unit tests only.',
    'Existing tests of all types may be executed, corrected, and extended',
    'Never weaken assertions to conceal regressions.',
    'Request PR reviews exclusively from `artiphishle`.',
    'If GitHub disallows self-review, report it; select no substitute.',
    'Verify the exact remote HEAD SHA.',
    'If remote persistence is technically impossible, preserve local work',
    'Read-only reviews report findings without creating commits.',
    'Never claim failing or unverified mandatory checks have passed.',
    'The release workflow regenerates documentation after the version bump.',
    'After Changeset creation, run `bun run format`',
    'Include the Changeset file in formatting.',
    'Skill scripts must use TypeScript (`.ts`) and run with Bun.',
  ];
  for (const instruction of requiredInstructions) {
    expect(contents).toContain(instruction);
  }
  expect(contents).not.toContain('If the task scope expands');
  expect(contents).not.toContain('resolve every failure');
  expect(contents).not.toContain('bun run knip:test');
  expect(contents.match(/## GitHub task lifecycle and delivery/gu)).toHaveLength(1);

  expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
    { relativePath: 'AGENTS.md', action: 'unchanged' },
    { relativePath: 'CLAUDE.md', action: 'unchanged' },
    { relativePath: 'GEMINI.md', action: 'unchanged' },
  ]);
});

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
