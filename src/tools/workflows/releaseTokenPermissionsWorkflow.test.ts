import { expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

test('managed release keeps finalization and rollout token permissions separately scoped', async () => {
  const release = await renderReleaseWorkflowAsync();
  const preparationToken = extractTokenScope(release, 'Create the scoped release token');
  const finalizationIndex = release.indexOf('\n  finalize:');
  if (finalizationIndex === -1) throw new Error('Missing finalize job.');

  const finalizationToken = extractTokenScope(
    release.slice(finalizationIndex),
    'Create the scoped release token',
  );
  const rolloutToken = extractTokenScope(release, 'Create the scoped rollout token');

  expectPackageReleaseTokenPermissions(preparationToken);
  expectPackageReleaseTokenPermissions(finalizationToken);
  expect(rolloutToken).toContain('repositories: renovate');
  expect(rolloutToken).toContain('permission-contents: write');
  expect(rolloutToken).not.toContain('permission-workflows: write');
});

/*** Render the managed release workflow whose scoped tokens are under test. */
async function renderReleaseWorkflowAsync(): Promise<string> {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }

  return releaseDefinition.render('.');
}

/*** Assert a package-release token can update content and workflow files in its own repository. */
function expectPackageReleaseTokenPermissions(token: string): void {
  expect(token).toContain('repositories: ${{ github.event.repository.name }}');
  expect(token).toContain('permission-contents: write');
  expect(token).toContain('permission-workflows: write');
}

/*** Extract one named token-creation step without conflating adjacent token permissions. */
function extractTokenScope(release: string, stepName: string): string {
  const marker = `      - name: ${stepName}`;
  const start = release.indexOf(marker);
  const nextStep = release.indexOf('\n      - name:', start + marker.length);

  if (start === -1 || nextStep === -1) {
    throw new Error(`Missing ${stepName} workflow step.`);
  }

  return release.slice(start, nextStep);
}
