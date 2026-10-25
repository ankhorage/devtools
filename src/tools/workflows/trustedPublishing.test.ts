import { expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

test('managed release publishes through OIDC without generated registry authentication', async () => {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }

  const release = await releaseDefinition.render('.');
  expect(release.match(/actions\/setup-node@v7/gu)).toHaveLength(2);
  expect(release).toContain('package-manager-cache: false');
  expect(release).toContain('npm install -g npm@11.5.1');
  expect(release).not.toContain('actions/setup-node@v4');
  expect(release).not.toContain('registry-url: https://registry.npmjs.org');
  expect(release).not.toContain('NODE_AUTH_TOKEN');
  expect(release).toContain('id-token: write');
});
