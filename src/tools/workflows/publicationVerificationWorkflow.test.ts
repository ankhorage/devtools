import { expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

test('managed workflows freeze initial installs and independently verify npm publication integrity', async () => {
  const [ci, release] = await Promise.all([
    workflowManagedFiles[0].render?.('.'),
    workflowManagedFiles[1].render?.('.'),
  ]);
  if (ci === undefined || release === undefined) {
    throw new Error('Missing managed CI or release workflow renderer.');
  }

  expect(ci).toContain(
    '      - name: Install dependencies\n        run: bun install --frozen-lockfile',
  );
  expect(release).toContain(
    '      - name: Install dependencies\n        run: bun install --frozen-lockfile',
  );
  expect(release).toContain(
    'Changesets can intentionally update package metadata and the lockfile',
  );
  expect(release).toContain('          bun install --ignore-scripts');
  expect(release).toContain('timeout-minutes: 40');
  expect(release).toContain('max_attempts=60');
  expect(release).toContain('retry_seconds=30');
  expect(release).toContain(
    'npm view "$package_spec" name version dist.tarball dist.integrity --json',
  );
  expect(release).toContain('if [ "$package_name" != "$PUBLISHED_PACKAGE_NAME" ]');
  expect(release).toContain('[[ "$integrity" != sha512-* ]]');
  expect(release).toContain(
    'curl --fail --location --silent --show-error --output "$artifact" "$tarball"',
  );
  expect(release).toContain('createHash("sha512")');
  expect(release).toContain('npm registry authorization failed');
  expect(release).toContain('npm tarball authorization failed');
  expect(release).toContain('Registry propagation is still pending');
  expect(release).toContain('Tarball propagation is still pending');
  expect(release).toContain('network or registry error');
  expect(release).toContain('Wrong npm publication metadata');
  expect(release).toContain('Wrong npm tarball');
  expect(release).toContain('npm publication propagation timeout');
  expect(release).not.toContain('npm pack "$package_spec"');
});
