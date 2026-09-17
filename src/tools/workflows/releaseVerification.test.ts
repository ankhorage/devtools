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
  const verificationJobIndex = release.indexOf('  verify-publication:');
  const finalizationJobIndex = release.indexOf('  finalize:');

  expect(verificationJobIndex).toBeGreaterThan(publishIndex);
  expect(finalizationJobIndex).toBeGreaterThan(verificationJobIndex);
  expect(release).toContain('needs: release');
  expect(release).toContain("if: needs.release.outputs.versioned == 'true'");
  expect(release).toContain('needs.verify-publication.result == \'success\'');
  expect(release).toContain('ref: ${{ needs.release.outputs.release_sha }}');
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
  expect(release).toContain('Verify published npm artifact from a fresh runner');
  expect(release).toContain('release_sha: ${{ steps.release.outputs.release_sha }}');
  expect(release).toContain('echo "release_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"');
  expect(release).toContain('git tag "$tag" "$RELEASE_SHA"');
  expect(release).toContain('gh release create "$tag" --repo "$GITHUB_REPOSITORY" --generate-notes --target "$RELEASE_SHA"');
});
