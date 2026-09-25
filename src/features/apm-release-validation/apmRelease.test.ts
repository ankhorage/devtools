import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { ApmUpdateDescriptor } from '@ankhorage/apm/types';
import { afterEach, expect, test } from 'bun:test';

import {
  synchronizeApmReleaseDescriptorAsync,
  validatePackedApmReleaseAsync,
} from '../../apmRelease.js';
import { runApmReleaseCommandAsync } from '../../cli/runApmReleaseCommandAsync.js';
import { descriptor, manifest, projectionDescriptor } from './apmRelease.fixtures.test.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

test('synchronization rejects invalid opt-in rather than silently skipping it', async () => {
  const root = await fixtureAsync(descriptor());
  await writeJsonAsync(join(root, 'package.json'), { ...manifest(), ankh: { apm: null } });
  expect(String(await rejectedAsync(synchronizeApmReleaseDescriptorAsync(root)))).toContain(
    'Invalid APM',
  );
});

test('synchronization binds the actual version and is idempotent', async () => {
  const root = await fixtureAsync(descriptor());
  await writeJsonAsync(join(root, 'package.json'), { ...manifest(), version: '2.1.0' });
  expect(await synchronizeApmReleaseDescriptorAsync(root)).toBe(true);
  expect(await synchronizeApmReleaseDescriptorAsync(root)).toBe(false);
  const packed = await validatePackedApmReleaseAsync(root);
  expect(packed.valid).toBe(true);
  expect(packed.packageVersion).toBe('2.1.0');
});

test('synchronization cannot retarget another owner or follow descriptor symlinks outside the root', async () => {
  const root = await fixtureAsync({
    ...descriptor(),
    owner: { name: 'other-owner', version: '2.0.0' },
  });
  expect(String(await rejectedAsync(synchronizeApmReleaseDescriptorAsync(root)))).toContain(
    'belong',
  );
  const outside = await fixtureAsync(descriptor());
  await rm(join(root, 'apm/update.json'));
  await symlink(join(outside, 'apm/update.json'), join(root, 'apm/update.json'));
  expect(await rejectedAsync(synchronizeApmReleaseDescriptorAsync(root))).toBeInstanceOf(Error);
});

test('packed validation rejects source-only metadata missing from the actual tarball', async () => {
  const root = await fixtureAsync(descriptor());
  await writeJsonAsync(join(root, 'package.json'), { ...manifest(), files: ['dist'] });
  expect(await rejectedAsync(validatePackedApmReleaseAsync(root))).toBeInstanceOf(Error);
});

test('packs outside the checkout, disables lifecycle scripts, and retains exact accepted bytes', async () => {
  const root = await fixtureAsync(descriptor());
  const outputRoot = await temporaryRootAsync();
  const artifactPath = join(outputRoot, 'accepted.tgz');
  const before = await readFile(join(root, 'package.json'), 'utf8');
  const report = await validatePackedApmReleaseAsync(root, { artifactPath });
  expect(report.valid).toBe(true);
  expect(report.artifactPath).toBe(artifactPath);
  expect(report.integrity).toBe(
    `sha512-${createHash('sha512')
      .update(await readFile(artifactPath))
      .digest('base64')}`,
  );
  expect(await readFile(join(root, 'package.json'), 'utf8')).toBe(before);
  expect(await rejectedAsync(access(join(root, 'lifecycle-ran')))).toBeInstanceOf(Error);
  expect(await rejectedAsync(validatePackedApmReleaseAsync(root, { artifactPath }))).toBeInstanceOf(
    Error,
  );
});

test('owner code requires consent and native conditional exports resolve from the packed package', async () => {
  const root = await fixtureAsync(projectionDescriptor());
  expect((await validatePackedApmReleaseAsync(root)).blockers[0]).toContain('owner-code-consent');
  expect(await rejectedAsync(access(join(root, 'owner-ran')))).toBeInstanceOf(Error);
  expect(await validatePackedApmReleaseAsync(root, { allowOwnerCode: true })).toMatchObject({
    valid: true,
    blockers: [],
  });
});

test('rejects missing exported code, invalid runtime shape and stale descriptor binding', async () => {
  const root = await fixtureAsync(projectionDescriptor());
  for (const source of [
    'export default {};',
    "export default { protocolVersion: 1, descriptorDigest: 'wrong', migrations: [], projections: [] };",
  ]) {
    await writeFile(join(root, 'dist/apm.js'), source);
    expect((await validatePackedApmReleaseAsync(root, { allowOwnerCode: true })).valid).toBe(false);
  }
  await rm(join(root, 'dist/apm.js'));
  expect((await validatePackedApmReleaseAsync(root, { allowOwnerCode: true })).valid).toBe(false);
});

test('invalid descriptor and changed integrity never load executable owner code', async () => {
  const root = await fixtureAsync(projectionDescriptor());
  await writeFile(
    join(root, 'dist/apm.js'),
    `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(join(root, 'owner-ran'))}, 'executed'); export default {};`,
  );
  expect(
    (
      await validatePackedApmReleaseAsync(root, {
        allowOwnerCode: true,
        expectedIntegrity: 'sha512-wrong',
      })
    ).valid,
  ).toBe(false);
  await writeJsonAsync(join(root, 'apm/update.json'), {
    ...projectionDescriptor(),
    schemaVersion: 99,
  });
  expect((await validatePackedApmReleaseAsync(root, { allowOwnerCode: true })).valid).toBe(false);
  expect(await rejectedAsync(access(join(root, 'owner-ran')))).toBeInstanceOf(Error);
});

test('CLI reports failures through exit codes and does not accept undeclared arguments', async () => {
  const root = await fixtureAsync(descriptor());
  const stdout: string[] = [];
  const stderr: string[] = [];
  const context = {
    cwd: root,
    writeStdout: (text: string) => {
      stdout.push(text);
    },
    writeStderr: (text: string) => {
      stderr.push(text);
    },
  };
  expect(await runApmReleaseCommandAsync('validate', [], context)).toEqual({ exitCode: 0 });
  expect(stdout.join('')).toContain('"valid":true');
  for (const args of [
    ['--unknown'],
    ['--artifact'],
    ['--artifact', '--allow-owner-code'],
    ['one', 'two'],
  ]) {
    expect(await runApmReleaseCommandAsync('validate', args, context)).toEqual({ exitCode: 1 });
  }
  expect(stderr.length).toBe(4);
});

/*** Create an independent package root; only normal installed dependencies are supplied. */
async function fixtureAsync(value: ApmUpdateDescriptor): Promise<string> {
  const root = await temporaryRootAsync();
  await mkdir(join(root, 'apm'));
  await mkdir(join(root, 'dist'));
  await writeJsonAsync(join(root, 'package.json'), manifest());
  await writeJsonAsync(join(root, 'apm/update.json'), value);
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'dir');
  await writeFile(
    join(root, 'dist/apm.js'),
    `import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const descriptorDigest = createHash('sha256').update(readFileSync(new URL('../apm/update.json', import.meta.url))).digest('hex');
export default { protocolVersion: 1, descriptorDigest, migrations: [], projections: [{ id: 'fixture-projection',
inspectAsync: async () => ({}), planAsync: async () => ({}), materializeAsync: async () => {}, verifyAsync: async () => ({}) }] };`,
  );
  return root;
}

/*** Track one temporary test root for deterministic cleanup. */
async function temporaryRootAsync(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'devtools-apm-test-'));
  roots.push(root);
  return root;
}

/*** Write a deterministic JSON fixture without depending on ambient formatting. */
async function writeJsonAsync(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/*** Await a rejected operation explicitly so Bun's synchronous matcher types cannot hide pending assertions. */
async function rejectedAsync(operation: Promise<unknown>): Promise<unknown> {
  return operation.then(
    () => {
      throw new Error('Expected operation to reject.');
    },
    (error: unknown) => error,
  );
}
