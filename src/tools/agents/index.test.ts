import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { syncManagedFiles } from '../shared/managedFiles.js';
import { agentsManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('managed AGENTS.md', () => {
  it('renders package identity and the unconditional current-architecture policy', async () => {
    const target = await createTarget({
      name: '@ankhorage/example',
      description: 'Example package.',
    });

    expect(await syncManagedFiles(target, agentsManagedFiles, { dryRun: false })).toEqual([
      { relativePath: 'AGENTS.md', action: 'created' },
    ]);
    const contents = await readFile(join(target, 'AGENTS.md'), 'utf8');
    expect(contents).toContain('Package: `@ankhorage/example`');
    expect(contents).toContain('Example package.');
    expect(contents).toContain('Only the current Ankhorage architecture is valid.');
    expect(contents).toContain('Do not add or retain deprecated APIs');
    expect(contents).toContain('Before changing any file, read this `AGENTS.md` completely');
    expect(contents).toContain('Load and follow every repository-local skill relevant to the task');
    expect(contents).toContain('.agents/skills/ankhorage-coding-rules/SKILL.md');
    expect(contents).toContain('.agents/skills/ankhorage-project-structure/SKILL.md');
    expect(contents).toContain(
      `Before creating a pull request, run all of these commands in this order and resolve every failure:

\`\`\`sh
bun run build
bun run check-types
bun run lint
bun run knip:test
bun run changeset
bun run format
\`\`\``,
    );
    expect(contents).toContain('Scripts inside an Agent Skill must always be TypeScript files');
    expect(contents).toContain('`.js`, `.mjs`, or `.cjs` are not allowed');
    expect(contents).not.toContain('AGENTS.override.md');
  });

  it('updates when package identity changes and handles missing identity truthfully', async () => {
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
    ]);
  });
});

async function createTarget(manifest: Record<string, unknown>): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-agents-');
  temporaryDirectories.push(target);
  await writeFile(join(target, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return target;
}
