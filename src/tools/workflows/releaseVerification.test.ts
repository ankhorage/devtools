import { expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

test('managed release verifies the exact npm artifact before finalization', async () => {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }

  const release = await releaseDefinition.render('.');
  const publishIndex = release.indexOf('      - name: Publish unpublished packages');
  const verificationIndex = release.indexOf('      - name: Verify published npm artifact');
  const finalizationIndex = release.indexOf(
    '      - name: Finalize Changesets v3 tags and GitHub releases',
  );
  const rolloutIndex = release.indexOf('      - name: Create the scoped rollout token');

  expect(verificationIndex).toBeGreaterThan(publishIndex);
  expect(finalizationIndex).toBeGreaterThan(verificationIndex);
  expect(rolloutIndex).toBeGreaterThan(verificationIndex);
  expect(release).toContain('npm view "$package_spec" version dist.tarball dist.integrity --json');
  expect(release).toContain('curl --fail --location --silent --show-error --output "$artifact"');
  expect(release).toContain("const actual='sha512-'");
  expect(release).toContain('npm pack "$package_spec" --pack-destination "$attempt_pack_dir"');
  expect(release).toContain('max_attempts=60');
  expect(release).toContain('retry_seconds=30');
  expect(release).toContain('last_stage="registry-metadata"');
  expect(release).toContain('last_stage="tarball-download"');
  expect(release).toContain('last_stage="integrity"');
  expect(release).toContain('last_stage="npm-pack"');
  expect(release).toContain('Published npm artifact not ready at stage: ${last_stage}.');
  expect(release).toContain('attempt_pack_dir="$pack_dir/attempt-${attempt}"');
});
