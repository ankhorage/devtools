import { readFile } from 'node:fs/promises';

import { expect, test } from 'bun:test';

test('keeps the opt-in pre-publish snapshot gate before Changesets versioning', async () => {
  const workflow = await readFile(new URL('./files/release.yml', import.meta.url), 'utf8');
  expect(workflow).toContain('pre-publish-release-wave-snapshot');
  expect(workflow).toContain("ANKHORAGE_PRE_PUBLISH_SNAPSHOT_GATE_ENABLED == 'true'");
  expect(workflow).toContain('Release-wave ACK timeout');
  expect(workflow.indexOf('Acknowledge immutable pre-publish release-wave snapshot')).toBeLessThan(
    workflow.indexOf('Version packages directly on main'),
  );
  expect(workflow).toContain('changesets-status-recheck.json');
});
