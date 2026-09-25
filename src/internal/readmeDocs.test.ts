import { REPOSITORY_POLICY } from '@ankhorage/policy/repository';
import { describe, expect, it } from 'bun:test';

import { getReadmeDocumentationErrors } from './readmeDocs.js';

describe('README documentation validation', () => {
  it('accepts a README that documents the complete command surface', () => {
    expect(getReadmeDocumentationErrors(createCanonicalReadmeFixture())).toEqual([]);
  });

  it('reports missing command references', () => {
    expect(getReadmeDocumentationErrors('ankh devtools lint')).toContain(
      'README.md is missing required documentation snippet: ankh devtools sync',
    );
  });
});

/*** Build one README fixture containing every required managed documentation marker. */
function createCanonicalReadmeFixture(): string {
  return [
    'ankh devtools lint',
    'ankh devtools changeset',
    'ankh devtools format',
    'ankh devtools knip',
    'ankh devtools sync',
    'ankh devtools status',
    'ankh devtools agents sync',
    'ankh devtools skills sync',
    'ankh devtools eslint sync',
    'ankh devtools prettier sync',
    'ankh devtools knip sync',
    'ankh devtools package sync',
    'ankh devtools workflows sync',
    'ankh devtools vscode sync',
    'devtools.eslint.sync',
    'devtools.prettier.sync',
    'devtools.knip.sync',
    'devtools.package.sync',
    'devtools.workflows.sync',
    'devtools.vscode.sync',
    'devtools.agents.sync',
    'devtools.skills.sync',
    'ankhorage-coding-rules',
    'hexagonal-architecture',
    '--dry-run',
    "profile: 'auto'",
    '@ankhorage/project-detector',
    'ankhorage-changeset',
    'without creating a second Version Packages pull request',
    'chore(release)',
    '.changeset/config.json',
    '<!-- devtools-bun-policy:start -->',
    '<!-- devtools-bun-policy:end -->',
    'bun scripts/sync-renovate-owner.ts sync repository',
    'bun scripts/sync-renovate-owner.ts status',
    '@ankhorage/policy',
    REPOSITORY_POLICY.runtime.bun.version,
    REPOSITORY_POLICY.runtime.bun.packageManager,
    REPOSITORY_POLICY.runtime.bun.typesRange,
  ].join('\n');
}
