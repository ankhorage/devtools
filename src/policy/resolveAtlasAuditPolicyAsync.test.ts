import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { REPOSITORY_RULE_METADATA } from '@ankhorage/rules-repository';
import { afterEach, describe, expect, test } from 'bun:test';

import { resolveAtlasAuditPolicyAsync } from './resolveAtlasAuditPolicyAsync.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('Atlas audit policy', () => {
  test('pins the blocking cycle audit for repositories with source', async () => {
    const target = await createTarget();
    await mkdir(join(target, 'src'));

    const policy = await resolveAtlasAuditPolicyAsync(target);

    expect(policy).toEqual({
      artifactName: REPOSITORY_RULE_METADATA.atlasAudit.artifactName,
      artifactPath: REPOSITORY_RULE_METADATA.atlasAudit.artifactPath,
      command: REPOSITORY_RULE_METADATA.atlasAudit.command,
    });
  });

  test('does not enable Atlas for repositories without a source tree', async () => {
    const target = await createTarget();

    const policy = await resolveAtlasAuditPolicyAsync(target);

    expect(policy).toBeUndefined();
  });
});

/*** Create an isolated managed-repository fixture. */
async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-atlas-audit-');
  temporaryDirectories.push(target);
  return target;
}
