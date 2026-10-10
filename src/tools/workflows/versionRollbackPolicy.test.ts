import { expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

test('managed CI rejects pull-request package version rollbacks before merge', async () => {
  const ci = await workflowManagedFiles[0].render?.('.');

  expect(ci).toContain('Reject package version rollback');
  expect(ci).toContain("base_sha='${{ github.event.pull_request.base.sha }}'");
  expect(ci).toContain(
    'Package version rollback: ${process.env.CANDIDATE_VERSION} is lower than base ${process.env.BASE_VERSION}.',
  );
});
