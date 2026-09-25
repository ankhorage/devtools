import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';
import { afterEach, describe, expect, test } from 'bun:test';

import { synchronizeRenovateOwnerAsync } from './synchronizeRenovateOwnerAsync.js';

const temporaryDirectories: string[] = [];
const managedPaths = [
  'package.json',
  'README.md',
  'bun.lock',
  '.github/workflows/ci.yml',
  '.github/workflows/release.yml',
  '.github/workflows/renovate.yml',
] as const;

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('Devtools Renovate owner synchronization', () => {
  test('regenerates every Bun artifact and is byte-stable', async () => {
    const target = await createTarget();
    const unrelatedPath = join(target, 'notes.txt');
    await writeFile(unrelatedPath, 'leave me alone\n');

    await synchronizeRenovateOwnerAsync('sync', target, { runLockfileAsync });
    const first = await readManagedContents(target);

    expect(JSON.parse(first.packageJson)).toMatchObject({
      packageManager: REPOSITORY_POLICY.runtime.bun.packageManager,
      devDependencies: { '@types/bun': REPOSITORY_POLICY.runtime.bun.typesRange, typescript: '^5.9.3' },
    });
    expect(first.readme).toContain(`Bun runtime       ${REPOSITORY_POLICY.runtime.bun.version}`);
    expect(first.readme).toContain(`@types/bun        ${REPOSITORY_POLICY.runtime.bun.typesRange}`);
    expect(first.ci).toContain(`bun-version: '${REPOSITORY_POLICY.runtime.bun.version}'`);
    expect(first.ci).toContain('node ./dist/cli/bin/apm-release.js validate . --allow-owner-code');
    expect(first.release).toContain(`bun-version: '${REPOSITORY_POLICY.runtime.bun.version}'`);
    expect(first.release).toContain('node ./dist/cli/bin/apm-release.js sync .');
    expect(first.release).toContain('node ./dist/cli/bin/structure.js build .');
    expect(first.renovate).toMatch(/changeset\.yml@[0-9a-f]{40}/u);
    expect(await readFile(unrelatedPath, 'utf8')).toBe('leave me alone\n');

    await synchronizeRenovateOwnerAsync('sync', target, { runLockfileAsync });
    expect(await readManagedContents(target)).toEqual(first);
    await synchronizeRenovateOwnerAsync('status', target, { runLockfileAsync });
  });

  test('status rejects stale owner artifacts', async () => {
    const target = await createTarget();
    await synchronizeRenovateOwnerAsync('sync', target, { runLockfileAsync });
    await writeFile(join(target, 'package.json'), '{"name":"@ankhorage/devtools"}\n');

    expect(synchronizeRenovateOwnerAsync('status', target, { runLockfileAsync })).rejects.toThrow(
      'Stale Devtools owner policy artifacts: package.json',
    );
  });


});

test('preserves the Renovate-managed digest during owner synchronization', async () => {
  const target = await createTarget();
  await synchronizeRenovateOwnerAsync('sync', target, { runLockfileAsync });
  const workflowPath = join(target, '.github/workflows/renovate.yml');
  const workflow = await readFile(workflowPath, 'utf8');
  const preservedDigest = 'f'.repeat(40);
  await writeFile(
    workflowPath,
    workflow.replace(/(changeset\.yml@)[0-9a-f]{40}/u, `$1${preservedDigest}`),
  );

  await synchronizeRenovateOwnerAsync('sync', target, { runLockfileAsync });
  await synchronizeRenovateOwnerAsync('status', target, { runLockfileAsync });
  expect(await readFile(workflowPath, 'utf8')).toContain(`changeset.yml@${preservedDigest}`);
});

async function createTarget(): Promise<string> {
  const target = await mkdtemp(join(tmpdir(), 'devtools-owner-'));
  temporaryDirectories.push(target);
  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify(
      {
        name: '@ankhorage/devtools',
        packageManager: 'bun@0.0.0',
        devDependencies: { '@types/bun': '^0.0.0', typescript: '^5.9.3' },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(target, 'README.md'),
    `Before\n<!-- devtools-bun-policy:start -->\nstale\n<!-- devtools-bun-policy:end -->\nAfter\n`,
  );
  return target;
}

async function readManagedContents(target: string): Promise<{
  readonly bunLock: string;
  readonly ci: string;
  readonly packageJson: string;
  readonly readme: string;
  readonly release: string;
  readonly renovate: string;
}> {
  const [packageJson, readme, bunLock, ci, release, renovate] = await Promise.all(
    managedPaths.map(async (relativePath) => await readFile(join(target, relativePath), 'utf8')),
  );
  return { bunLock, ci, packageJson, readme, release, renovate };
}

async function runLockfileAsync(operation: 'status' | 'sync', target: string): Promise<void> {
  if (operation === 'sync') await writeFile(join(target, 'bun.lock'), 'stable lockfile\n');
}
