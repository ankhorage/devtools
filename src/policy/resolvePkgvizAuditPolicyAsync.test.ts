import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, test } from 'bun:test';

import { resolvePkgvizAuditPolicyAsync } from './resolvePkgvizAuditPolicyAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('PKGViz audit policy', () => {
  test('pins the blocking cycle audit for repositories with source', async () => {
    const target = await createTarget();
    await mkdir(join(target, 'src'));

    const policy = await resolvePkgvizAuditPolicyAsync(target);

    expect(policy).toEqual({
      artifactName: 'pkgviz-audit',
      artifactPath: 'pkgviz-audit.json',
      command: 'bunx pkgviz@0.8.1 --out pkgviz-audit.json --rule cyclic-dependencies=block',
    });
  });

  test('does not enable PKGViz for repositories without a source tree', async () => {
    const target = await createTarget();

    const policy = await resolvePkgvizAuditPolicyAsync(target);

    expect(policy).toBeUndefined();
  });
});

/*** Create an isolated managed-repository fixture. */
async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-pkgviz-audit-');
  temporaryDirectories.push(target);
  return target;
}
