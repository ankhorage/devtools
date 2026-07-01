const REQUIRED_README_SNIPPETS = [
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
] as const;

export function getReadmeDocumentationErrors(readmeContents: string): string[] {
  return REQUIRED_README_SNIPPETS.flatMap((snippet) =>
    readmeContents.includes(snippet)
      ? []
      : [`README.md is missing required documentation snippet: ${snippet}`],
  );
}
