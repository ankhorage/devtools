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
  expectReleaseOrdering(release);
  expectPackedRuntimeVerification(release);
  expectPublishedArtifactVerification(release);
});

/*** Assert release ordering and exact release-commit finalization. */
function expectReleaseOrdering(release: string): void {
  const publishIndex = release.indexOf('      - name: Publish unpublished packages');
  const verificationJobIndex = release.indexOf('  verify-publication:');
  const finalizationJobIndex = release.indexOf('  finalize:');

  expect(verificationJobIndex).toBeGreaterThan(publishIndex);
  expect(finalizationJobIndex).toBeGreaterThan(verificationJobIndex);
  expect(release).toContain('needs: release');
  expect(release).toContain("if: needs.release.outputs.versioned == 'true'");
  expect(release).toContain("needs.verify-publication.result == 'success'");
  expect(release).toContain('ref: ${{ needs.release.outputs.release_sha }}');
  expect(release).toContain('release_sha: ${{ steps.release.outputs.release_sha }}');
  expect(release).toContain('echo "release_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"');
  expect(release).toContain('git tag "$tag" "$RELEASE_SHA"');
  expect(release).toContain(
    'gh release create "$tag" --repo "$GITHUB_REPOSITORY" --generate-notes --target "$RELEASE_SHA"',
  );
}

/*** Assert the clean packed consumer loads every declared runtime boundary before publication. */
function expectPackedRuntimeVerification(release: string): void {
  expect(release).toContain('Verify standalone packed install');
  expect(release).toContain('npm pack --ignore-scripts --pack-destination "$pack_dir"');
  expect(release).toContain(
    'PACKAGE_NAME="$package_name" node - <<\'NODE\' > runtime-entrypoints.txt',
  );
  expect(release).toContain("const importConditions = new Set(['bun', 'default', 'import', 'node']);");
  expect(release).toContain("const requireConditions = new Set(['default', 'node', 'require']);");
  expect(release).toContain("if (supportsLoader(target, importConditions)) return 'import';");
  expect(release).toContain("if (supportsLoader(target, requireConditions)) return 'require';");
  expect(release).toContain('if (exportsMap === undefined)');
  expect(release).toContain("!Object.keys(exportsMap).some((key) => key.startsWith('.'))");
  expect(release).toContain('records.push(`${loader}|${specifier}`);');
  expect(release).toContain("process.stdout.write(output.length === 0 ? '' : `${output.join('\\n')}\\n`);");
  expect(release).toContain("while IFS='|' read -r loader specifier; do");
  expect(release).toContain(
    'PACKAGE_SPECIFIER="$specifier" bun -e \'await import(process.env.PACKAGE_SPECIFIER)\'',
  );
  expect(release).toContain(
    'PACKAGE_SPECIFIER="$specifier" node -e \'require(process.env.PACKAGE_SPECIFIER)\'',
  );
  expect(release).toContain('PACKAGE_NAME="$package_name" node - <<\'NODE\' > binary-paths.txt');
  expect(release).toContain("process.stdout.write(paths.length === 0 ? '' : `${paths.join('\\n')}\\n`);");
  expect(release).toContain('bun build "$binary_path" --target=bun --outdir "$binary_build_dir"');
  expect(release).toContain('timeout 5s bun "$binary_path"');
  expect(release).toContain('Packed binary runtime dependency missing');
  expect(release).not.toContain('pathToFileURL(process.env.BINARY_PATH)');
  expect(release).not.toContain('--help');
}
/*** Assert the public npm artifact is independently retrievable before finalization. */
function expectPublishedArtifactVerification(release: string): void {
  expect(release).toContain('npm view "$package_spec" version dist.tarball dist.integrity --json');
  expect(release).toContain('Array.isArray(raw)&&raw.length===1?raw[0]:raw');
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
}
