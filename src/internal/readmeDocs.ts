import { bunRuntimePolicy } from '../policy/bunRuntimePolicy.js';

const REQUIRED_README_SNIPPETS = [
  'ankh devtools lint',
  'ankh devtools changeset',
  'ankh devtools format',
  'ankh devtools knip',
  'ankh devtools sync',
  'ankh devtools status',
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
  '--dry-run',
  "profile: 'auto'",
  '@ankhorage/utility/project',
  'ankhorage-changeset',
  'changeset-release/main',
  'bun run changeset -- status',
  '.changeset/config.json',
  '<!-- devtools-bun-policy:start -->',
  '<!-- devtools-bun-policy:end -->',
  'bun scripts/sync-renovate-owner.ts sync repository',
  'bun scripts/sync-renovate-owner.ts status',
  bunRuntimePolicy.version,
  bunRuntimePolicy.packageManager,
  bunRuntimePolicy.typesRange,
] as const;

export function getReadmeDocumentationErrors(readmeContents: string): string[] {
  return REQUIRED_README_SNIPPETS.flatMap((snippet) =>
    readmeContents.includes(snippet)
      ? []
      : [`README.md is missing required documentation snippet: ${snippet}`],
  );
}
