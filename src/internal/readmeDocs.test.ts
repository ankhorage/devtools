import { describe, expect, it } from 'bun:test';

import { bunRuntimePolicy } from '../policy/bunRuntimePolicy.js';
import { getReadmeDocumentationErrors } from './readmeDocs.js';

describe('README documentation validation', () => {
  it('accepts a README that documents the complete command surface', () => {
    const readme = [
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
      '--dry-run',
      "profile: 'auto'",
      '@ankhorage/utility/project',
      'ankhorage-changeset',
      'changeset-release/main',
      'bun run changeset -- status --since=HEAD',
      '.changeset/config.json',
      '<!-- devtools-bun-policy:start -->',
      '<!-- devtools-bun-policy:end -->',
      'bun scripts/sync-renovate-owner.ts sync repository',
      'bun scripts/sync-renovate-owner.ts status',
      bunRuntimePolicy.version,
      bunRuntimePolicy.packageManager,
      bunRuntimePolicy.typesRange,
    ].join('\n');

    expect(getReadmeDocumentationErrors(readme)).toEqual([]);
  });

  it('reports missing command references', () => {
    expect(getReadmeDocumentationErrors('ankh devtools lint')).toContain(
      'README.md is missing required documentation snippet: ankh devtools sync',
    );
  });
});
