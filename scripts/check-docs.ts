import { readFileSync } from 'node:fs';

import { getReadmeDocumentationErrors } from '../src/internal/readmeDocs.js';
import repositoryMetadata from '../src/metadata/repository.json' with { type: 'json' };

const readmePath = new URL('../README.md', import.meta.url);

function main(): number {
  const readmeContents = readFileSync(readmePath, 'utf8');
  const errors = getReadmeDocumentationErrors(readmeContents, repositoryMetadata.title);

  if (errors.length === 0) {
    return 0;
  }

  for (const error of errors) {
    console.error(error);
  }

  return 1;
}

process.exit(main());
