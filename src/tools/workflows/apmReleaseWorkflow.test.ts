import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

test('opted-in releases validate and publish the same archive after versioning and rebuilding', async () => {
  const release = await readFile(new URL('./files/release.yml', import.meta.url), 'utf8');
  const version = release.indexOf('__ANKH_CHANGESETS_VERSION_COMMAND__');
  const sync = release.indexOf('__ANKH_APM_RELEASE_COMMAND__ sync .');
  const install = release.indexOf('bun install --frozen-lockfile --ignore-scripts', sync);
  const build = release.indexOf('bun run build', install);
  const tests = release.indexOf('bun run test:apm', build);
  const validate = release.indexOf(
    '__ANKH_APM_RELEASE_COMMAND__ validate . --allow-owner-code --artifact "$artifact"',
    tests,
  );
  const publish = release.indexOf('npm publish "$artifact" --ignore-scripts', validate);
  expect(version).toBeGreaterThan(0);
  expect(sync).toBeGreaterThan(version);
  expect(install).toBeGreaterThan(sync);
  expect(build).toBeGreaterThan(install);
  expect(tests).toBeGreaterThan(build);
  expect(validate).toBeGreaterThan(tests);
  expect(publish).toBeGreaterThan(validate);
  expect(release).toContain("p.error?.code !== 'E404'");
  expect(release).toContain('__ANKH_CHANGESETS_PUBLISH_COMMAND__');
});

test('CI requires owner transition tests as well as packed artifact validation', async () => {
  const ci = await readFile(new URL('./files/ci.yml', import.meta.url), 'utf8');
  expect(ci).toContain('p.ankh?.apm === undefined ? 1 : 0');
  expect(ci).toContain('bun run test:apm');
  expect(ci).toContain('__ANKH_APM_RELEASE_COMMAND__ validate . --allow-owner-code');
});

test('renders self-hosted and installed CLI paths without a self dependency', async () => {
  const { resolveApmReleaseCommandAsync } =
    await import('../../features/apm-release-validation/adapters/outbound/resolveApmReleaseCommandAsync.js');
  expect(await resolveApmReleaseCommandAsync('.')).toBe('node ./dist/cli/bin/apm-release.js');
  expect(await resolveApmReleaseCommandAsync(new URL('./files', import.meta.url).pathname)).toBe(
    './node_modules/.bin/ankhorage-apm-release',
  );
});
