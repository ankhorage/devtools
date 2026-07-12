import { describe, expect, it } from 'bun:test';

import { getReadmeDocumentationErrors } from './readmeDocs.js';

describe('README documentation validation', () => {
  it('accepts a README that documents the complete command surface', () => {
    const readme = [
      'ankh devtools lint',
      'ankh devtools format',
      'ankh devtools knip',
      'ankh devtools sync',
      'ankh devtools status',
      'ankh devtools workflows sync',
      'ankh devtools vscode sync',
      'devtools.workflows.sync',
      'devtools.vscode.sync',
      '--dry-run',
    ].join('\n');

    expect(getReadmeDocumentationErrors(readme)).toEqual([]);
  });

  it('reports missing command references', () => {
    expect(getReadmeDocumentationErrors('ankh devtools lint')).toContain(
      'README.md is missing required documentation snippet: ankh devtools sync',
    );
  });
});
