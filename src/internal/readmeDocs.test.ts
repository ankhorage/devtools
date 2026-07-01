import { describe, expect, it } from 'bun:test';

import { getReadmeDocumentationErrors } from './readmeDocs.js';

describe('README documentation validation', () => {
  it('accepts a README that documents the shipped command surface', () => {
    const readme = [
      'ankh devtools lint',
      'ankh devtools format',
      'ankh devtools knip',
      'ankhorage-eslint',
      'ankhorage-prettier',
      'ankhorage-knip',
      'devtools',
      'devtools.lint',
      'devtools.format',
      'devtools.knip',
    ].join('\n');

    expect(getReadmeDocumentationErrors(readme)).toEqual([]);
  });

  it('reports missing command or capability references', () => {
    expect(getReadmeDocumentationErrors('ankh devtools lint')).toContain(
      'README.md is missing required documentation snippet: devtools.knip',
    );
  });
});
