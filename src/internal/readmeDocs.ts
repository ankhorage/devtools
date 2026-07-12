const REQUIRED_README_SNIPPETS = [
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
] as const;

export function getReadmeDocumentationErrors(readmeContents: string): string[] {
  return REQUIRED_README_SNIPPETS.flatMap((snippet) =>
    readmeContents.includes(snippet)
      ? []
      : [`README.md is missing required documentation snippet: ${snippet}`],
  );
}
