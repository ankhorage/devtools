import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { inspectManagedSkills, syncManagedSkills } from './managed.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('managed repository skill synchronization', () => {
  it('replaces the canonical skill exactly and preserves unrelated skills', async () => {
    const target = await createTarget();
    const managedSkill = join(target, '.agents/skills/ankhorage-project-structure');
    const customSkill = join(target, '.agents/skills/custom-skill');
    await mkdir(managedSkill, { recursive: true });
    await mkdir(customSkill, { recursive: true });
    await writeFile(join(managedSkill, 'SKILL.md'), 'old skill\n');
    await writeFile(join(managedSkill, 'stale.txt'), 'remove me\n');
    await writeFile(join(customSkill, 'SKILL.md'), 'keep me\n');

    const results = await syncManagedSkills(target, '1.9.0', { dryRun: false });
    expect(results).toContainEqual({
      relativePath: '.agents/skills/ankhorage-project-structure/stale.txt',
      action: 'removed',
    });
    expect(await readFile(join(customSkill, 'SKILL.md'), 'utf8')).toBe('keep me\n');
    expect(await Bun.file(join(managedSkill, 'stale.txt')).exists()).toBe(false);
    expect(await readFile(join(managedSkill, 'SKILL.md'), 'utf8')).toContain(
      'name: ankhorage-project-structure',
    );
  });
});

describe('managed repository skill ownership', () => {
  it('records hashes, supports dry-run, and becomes idempotent', async () => {
    const target = await createTarget();
    const dryRunResults = await syncManagedSkills(target, '1.9.0', { dryRun: true });
    expect(dryRunResults.every((result) => result.action === 'would-create')).toBe(true);
    expect(await Bun.file(join(target, '.agents')).exists()).toBe(false);

    await syncManagedSkills(target, '1.9.0', { dryRun: false });
    const manifest = JSON.parse(
      await readFile(join(target, '.agents/.devtools-manifest.json'), 'utf8'),
    ) as {
      schemaVersion: number;
      sourceDevtoolsVersion: string;
      skills: Record<string, { files: Record<string, string> }>;
    };
    expect(manifest.schemaVersion).toBe(1);
    expect(manifest.sourceDevtoolsVersion).toBe('1.9.0');
    expect(Object.keys(manifest.skills)).toEqual(['ankhorage-project-structure']);
    expect(
      Object.values(manifest.skills['ankhorage-project-structure'].files).every((hash) =>
        /^sha256:[a-f0-9]{64}$/u.test(hash),
      ),
    ).toBe(true);
    expect(
      (await inspectManagedSkills(target, '1.9.0')).every((status) => status.state === 'current'),
    ).toBe(true);
    expect(
      (await syncManagedSkills(target, '1.9.0', { dryRun: false })).every(
        (result) => result.action === 'unchanged',
      ),
    ).toBe(true);
  });
});

describe('managed repository skill safety', () => {
  it('rejects unsafe ownership manifests', async () => {
    const unsafeTarget = await createTarget();
    await mkdir(join(unsafeTarget, '.agents'), { recursive: true });
    await writeFile(
      join(unsafeTarget, '.agents/.devtools-manifest.json'),
      JSON.stringify({
        schemaVersion: 1,
        sourceDevtoolsVersion: '1.8.2',
        skills: { removed: { files: { '../outside': `sha256:${'0'.repeat(64)}` } } },
      }),
    );
    await expectFailure(unsafeTarget, 'Unsafe managed path');
  });

  it('rejects symbolic-link targets', async () => {
    const linkedTarget = await createTarget();
    const outside = await mkdtemp('/tmp/devtools-skills-outside-');
    temporaryDirectories.push(outside);
    await mkdir(join(linkedTarget, '.agents'), { recursive: true });
    await symlink(outside, join(linkedTarget, '.agents/skills'));
    await expectFailure(linkedTarget, 'must not contain symbolic links');
  });
});

async function expectFailure(target: string, message: string): Promise<void> {
  try {
    await inspectManagedSkills(target, '1.9.0');
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain(message);
    return;
  }
  throw new Error(`Expected managed skill inspection to fail with: ${message}`);
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-skills-');
  temporaryDirectories.push(target);
  return target;
}
