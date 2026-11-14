import type { RepositoryMetadata } from '@ankhorage/contracts/metadata';
import { evaluateRepositoryMetadataPreflight } from '@ankhorage/rules-repository';

import { readRepositoryMetadataFactAsync } from '../../features/repository-metadata/application/readRepositoryMetadataFactAsync.js';

interface RepositoryIdentity {
  readonly description: string;
  readonly packageName: string;
}

/*** Render curated repository scope when valid metadata exists, preserving the manifest fallback. */
export async function renderRepositorySectionsAsync(
  targetDirectory: string,
  identity: RepositoryIdentity,
): Promise<string> {
  const fact = await readRepositoryMetadataFactAsync(targetDirectory);
  if (!fact.exists) {
    return renderFallbackRepositorySection(identity);
  }

  const evaluation = evaluateRepositoryMetadataPreflight({
    cliCommands: [],
    imports: [],
    metadata: { ...fact, eligibility: 'applicable', managed: true },
    packageJson: { dependencies: [], exports: [], fields: {}, scripts: {} },
    paths: [],
    workflowBunVersions: {},
  });
  if (fact.document === undefined || evaluation.findings.length > 0) {
    const messages = evaluation.findings.map(({ message }) => message).join('; ');
    throw new Error(
      `Invalid repository metadata at ${fact.path}: ${messages || 'document does not match the published contract'}`,
    );
  }

  return renderCuratedRepositorySections(identity.packageName, fact.document);
}

/*** Render the transition-safe package-manifest fallback when canonical metadata is absent. */
function renderFallbackRepositorySection(identity: RepositoryIdentity): string {
  return `## Repository

Package: \`${escapeInlineCode(identity.packageName)}\`

${escapeMarkdownText(identity.description)}

`;
}

/*** Render authored purpose, ownership, boundaries, audience, and architectural invariants. */
function renderCuratedRepositorySections(
  packageName: string,
  metadata: RepositoryMetadata,
): string {
  const repositoryDetails = [
    `Package: \`${escapeInlineCode(packageName)}\``,
    `Title: ${escapeMarkdownText(metadata.title)}`,
    escapeMarkdownText(metadata.summary),
    `Purpose: ${escapeMarkdownText(metadata.purpose)}`,
    renderList('Audience', metadata.audience),
  ]
    .filter((value) => value !== '')
    .join('\n\n');
  const scopeDetails = [
    renderList('Responsibilities', metadata.responsibilities),
    renderList('Boundaries', metadata.boundaries),
    metadata.architecture?.role === undefined
      ? ''
      : `Architecture role: ${escapeMarkdownText(metadata.architecture.role)}`,
    renderList('Architectural invariants', metadata.architecture?.invariants),
  ]
    .filter((value) => value !== '')
    .join('\n\n');

  return `## Repository

${repositoryDetails}

## Scope and boundaries

${scopeDetails || 'No additional scope or architecture facts are declared.'}

`;
}

/*** Render one optional authored collection as a deterministic Markdown list. */
function renderList(title: string, values: readonly string[] | undefined): string {
  if (values === undefined || values.length === 0) return '';
  return `${title}:

${values.map((value) => `- ${escapeMarkdownText(value)}`).join('\n')}`;
}

/*** Escape inline-code delimiters and backslashes inside a managed Markdown code span. */
function escapeInlineCode(value: string): string {
  return normalizeText(value).replaceAll('\\', '\\\\').replaceAll('`', '\\`');
}

/*** Flatten authored prose and escape Markdown control characters before interpolation. */
function escapeMarkdownText(value: string): string {
  return [...normalizeText(value)]
    .map((character) => (MARKDOWN_CONTROL_CHARACTERS.has(character) ? `\\${character}` : character))
    .join('');
}

/*** Normalize authored prose to one managed Markdown line without changing its words. */
function normalizeText(value: string): string {
  return value.trim().replaceAll(/\s+/gu, ' ');
}

const MARKDOWN_CONTROL_CHARACTERS = new Set(['\\', '`', '*', '_', '[', ']', '<', '>']);
