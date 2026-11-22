import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';
import { renderRepositorySectionsAsync } from './renderRepositorySectionsAsync.js';

export const agentsManagedFiles = [
  {
    relativePath: 'AGENTS.md',
    render: renderAgentsFile,
  },
  {
    relativePath: 'CLAUDE.md',
    symlinkTarget: 'AGENTS.md',
  },
  {
    relativePath: 'GEMINI.md',
    symlinkTarget: 'AGENTS.md',
  },
] as const satisfies readonly ManagedFileDefinition[];

/*** Render mandatory repository instructions from the target package identity. */
async function renderAgentsFile(targetDirectory: string): Promise<string> {
  const manifest = await readPackageManifest(targetDirectory);
  const packageName = readNonEmptyString(manifest.name) ?? 'Package name not declared';
  const description =
    readNonEmptyString(manifest.description) ?? 'No package description is declared.';
  const repositorySections = await renderRepositorySectionsAsync(targetDirectory, {
    description,
    packageName,
  });
  const sections = renderSharedAgentPolicy();
  const nextAgentsBlock = await readNextAgentsBlockAsync(targetDirectory, manifest);

  return `# AGENTS.md

<!-- This file is managed by @ankhorage/devtools. -->
${nextAgentsBlock}
${repositorySections}${sections}`;
}

/*** Preserve Next.js's complete managed instruction block when Next owns the target. */
async function readNextAgentsBlockAsync(
  targetDirectory: string,
  manifest: Record<string, unknown>,
): Promise<string> {
  if (!hasNextDependency(manifest)) return '';
  try {
    const contents = await readFile(resolve(targetDirectory, 'AGENTS.md'), 'utf8');
    const match = NEXT_AGENTS_BLOCK_PATTERN.exec(contents);
    return match === null ? '' : `${match[0]}\n`;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return '';
    throw error;
  }
}

/*** Report whether the manifest directly declares Next.js. */
function hasNextDependency(manifest: Record<string, unknown>): boolean {
  return [manifest.dependencies, manifest.devDependencies].some(
    (dependencies) => isRecord(dependencies) && typeof dependencies.next === 'string',
  );
}

/*** Render scope-frozen shared agent policy for managed repositories. */
function renderSharedAgentPolicy(): string {
  return [
    renderTaskAuthorityAndScope(),
    renderArchitectureAndDependencies(),
    renderDependencyInstructions(),
    renderManagedFileInstructions(),
    renderDatabaseAndInfrastructureInstructions(),
    renderSecurityInstructions(),
    renderRepositorySkillInstructions(),
    renderDocumentationInstructions(),
    renderTestingAndReviewInstructions(),
    renderGitHubTaskLifecycleAndDelivery(),
    renderPullRequestInstructions(),
  ].join('');
}

/*** Render the shared task authority and scope policy. */
function renderTaskAuthorityAndScope(): string {
  return `## Task authority and scope

The user's explicit requirements and acceptance criteria define the
authorized scope. Scope is frozen unless the user explicitly changes it.

- Implement exactly the requested outcome. Never invent requirements.
- No unsolicited features, refactoring, redesign, migrations,
  abstractions, compatibility layers, or architectural improvements.
- Change only files necessary for the task, including relevant tests,
  documentation sources, and release metadata.
- Existing defects, architecture debt, and reviewer suggestions do not
  authorize additional work.
- Repository rules and skills define HOW authorized work is implemented,
  never WHAT additional work may be performed.
- Never weaken mandatory quality, security, or validation requirements.

If correct implementation requires work outside scope, STOP.
Explain the blocker and wait for explicit user instructions.
Never independently expand scope or improvise workarounds.

STOP always means graceful stop: cease implementation, preserve and
remotely hand off task work, document blockers, and safely clean up
according to the delivery rules below.

Do not stop for unrelated cosmetic issues or optional improvements.

`;
}

/*** Render the shared architecture and dependencies policy. */
function renderArchitectureAndDependencies(): string {
  return `## Architecture and dependencies

Only the current Ankhorage architecture is valid.

- No deprecated APIs, compatibility shims, historical fallbacks,
  or dual implementation paths.
- Remove superseded implementations only within authorized work.
- Temporary migration paths require explicit authorization.
- Repositories must remain standalone, independently installable,
  buildable, testable, and usable with declared dependencies.
- No unpublished sibling sources, workspace/file/link dependencies,
  hidden organization-local state, or implicit deployment assumptions.
- Cross-package imports must use published public APIs.
- Published packages must remain consumer-agnostic.
- Provider-specific behavior belongs behind explicit boundaries.

If implementation requires changes in another repository, STOP.
Identify the repository, required change, and blocker.
Wait for explicit instructions.

Report unrelated architecture violations in a PR Conversation comment
with location, evidence, and impact. Never fix them independently.
Link directly to the comment in the final chat response.

`;
}

/*** Render the shared dependencies policy. */
function renderDependencyInstructions(): string {
  return `## Dependencies

- Use \`bun install\` for development and restoring existing dependencies.
- Use \`bun update\` for authorized existing dependency updates.
- Never add new dependencies without explicit user approval.
- Never downgrade dependencies.
- Do not perform dependency migrations or unrelated refactoring.
- Evaluate reputable existing packages before reimplementing their
  functionality; propose new dependencies for approval.
- Keep \`package.json\` and \`bun.lock\` synchronized and commit their changes.
- Use \`--frozen-lockfile\` for reproducible CI and release builds.

`;
}

/*** Render the shared managed and generated files policy. */
function renderManagedFileInstructions(): string {
  return `## Managed and generated files

Never directly edit generated or centrally managed files, including
\`AGENTS.md\`, \`CLAUDE.md\`, \`GEMINI.md\`, managed workflows, managed skills,
and generated documentation.

Read-only inspection is permitted.

Changes require explicit user authorization and must be implemented
through the canonical owner or generator.

If a protected file needs changes, STOP and report its owner.
Never modify generated output as a workaround.

`;
}

/*** Render the shared database and infrastructure policy. */
function renderDatabaseAndInfrastructureInstructions(): string {
  return `## Database and infrastructure

Database schema changes, data migrations, destructive operations,
and infrastructure mutations require explicit task authorization.

Otherwise STOP and report the proposed changes, impact, risks,
and rollback requirements.

Never independently modify database structures or existing data.

`;
}

/*** Render the shared security policy. */
function renderSecurityInstructions(): string {
  return `## Security

All security findings (P0–P3) are hard blockers.

On detection:
- STOP implementation immediately and perform graceful handoff.
- Report all findings as a prioritized P0–P3 list with evidence.
- Do not fix, bypass, merge, or deploy.
- Wait for explicit user instructions.

This includes pre-existing security vulnerabilities.

`;
}

/*** Render the shared repository instructions and skills policy. */
function renderRepositorySkillInstructions(): string {
  return `## Repository instructions and skills

Before editing, read \`AGENTS.md\` and inspect \`.agents/skills/\`.

Load:
- \`.agents/skills/ankhorage-coding-rules/SKILL.md\`
- \`.agents/skills/ankhorage-project-structure/SKILL.md\`
- Additional repository-local skills when applicable or required.

Follow applicable skills without expanding task scope.
STOP only when implementation would violate a mandatory requirement.

Never substitute generic or remembered instructions for repository-local
skills.

Skill scripts must use TypeScript (\`.ts\`) and run with Bun.
JavaScript skill scripts (\`.js\`, \`.mjs\`, \`.cjs\`) are prohibited.

`;
}

/*** Render the shared documentation policy. */
function renderDocumentationInstructions(): string {
  return `## Documentation

\`README.md\` and configured Paradox output are release-generated artifacts.
Never edit or commit them in ordinary feature PRs.

Update only relevant Paradox \`/*** ... */\` comments, real
\`examples/<example>/...\` usage sources, and necessary manual documentation.

The release workflow regenerates documentation after the version bump.
Do not generate unrelated documentation or examples.

`;
}

/*** Render the shared testing, validation and review policy. */
function renderTestingAndReviewInstructions(): string {
  return `## Testing, validation and review

- Create new unit tests only.
- Never introduce new E2E, smoke, integration, browser, simulator,
  performance, or other non-unit tests without explicit authorization.
- Existing tests of all types may be executed, corrected, and extended
  with directly relevant assertions within the authorized task.
- Never weaken assertions to conceal regressions.
- Run applicable mandatory CI checks without weakening or bypassing them.
- Do not invent additional test matrices or acceptance criteria.
- Recommend additional non-unit tests in the final handoff if useful.
  Their non-creation is not a blocker.

Run existing mandatory build, typecheck, lint, Knip, formatting,
and other quality checks.

- Fix task-introduced failures within scope.
- Report unrelated or pre-existing failures without fixing them.
- Do not repeatedly rerun unchanged failures without new evidence.
- Never disable, bypass, or falsify mandatory checks.

Review against original requirements and mandatory contracts.

Blocking findings require evidence of incorrect requested behavior,
introduced regressions, or mandatory contract violations.
Security findings always follow the Security hard-blocker policy.

Optional improvements and unrelated findings are non-blocking.
Document them in PR Conversation comments.

Reviewers cannot expand scope or introduce acceptance criteria.
Report failed and unverified checks accurately.

`;
}

/*** Render the shared github task lifecycle and delivery policy. */
function renderGitHubTaskLifecycleAndDelivery(): string {
  return `## GitHub task lifecycle and delivery

Treat each issue, PR, review, and change request as an independent task.

- Fetch current origin/main, issue, PR, HEAD, review, and CI state.
- Use a fresh isolated checkout or worktree for every task.
- Isolate concurrent workspaces, builds, temporary files, and caches.
- Continue change requests on the existing PR branch.
- Preserve unrelated user work and existing PR history.
- Use Conventional Commits and PR titles.
- Assign all issues and PRs to \`artiphishle\`.
- Request PR reviews exclusively from \`artiphishle\`.
- Never assign or request reviews from others without explicit approval.
- If GitHub disallows self-review, report it; select no substitute.
- Link issues to PRs and close issues only when completed.
- Never merge without explicit authorization.

Review the final diff and remove unauthorized changes.

For every task with changes, including blocked tasks:
1. Commit all recoverable task changes.
2. Push to the intended remote branch.
3. Verify the exact remote HEAD SHA.
4. Document blockers and findings in the PR.
5. Keep incomplete or blocked PRs in Draft.
6. Safely clean up task-owned temporary workspaces.

A recovery commit does not imply successful completion.

If remote persistence is technically impossible, preserve local work
and report the failed handoff, unpushed commits, and recovery location.
Never discard unpushed work to satisfy cleanup requirements.

Cleanup may remove only task-owned paths strictly beneath the resolved
system \`/tmp\` path (\`/private/tmp\` on macOS), using Git-aware removal.

Never remove unrelated work, shared paths, or unpersisted data.
Report cleanup success, failure, or omission.

Read-only reviews report findings without creating commits.

`;
}

/*** Render the shared pull requests and release preparation policy. */
function renderPullRequestInstructions(): string {
  return `## Pull requests and release preparation

Run applicable mandatory validation:

- \`bun run build\`
- \`bun run check-types\`
- \`bun run lint\`
- \`bun run knip:check\`
- Relevant unit tests and existing mandatory tests

Create the required Changeset for release-impacting work.
No release impact means no Changeset. Never create empty Changesets.

After Changeset creation, run \`bun run format\` as the final regular
file-writing validation operation.

Then run applicable read-only checks:
- \`bun run format:check\`
- \`bun run changeset:status\`

Include the Changeset file in formatting.
Repeat necessary final checks after subsequent file modifications.

Formatting must not introduce unrelated changes into the final diff.

A Draft PR may document blocked or partially verified work.
Never claim failing or unverified mandatory checks have passed.

Complete the delivery and cleanup process defined above.
`;
}

/*** Read the target package manifest used to personalize managed repository instructions. */
async function readPackageManifest(targetDirectory: string): Promise<Record<string, unknown>> {
  try {
    const contents = await readFile(resolve(targetDirectory, 'package.json'), 'utf8');
    const parsed = JSON.parse(contents) as unknown;
    if (!isRecord(parsed)) {
      throw new Error('package.json must contain a JSON object.');
    }
    return parsed;
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return {};
    }
    throw error;
  }
}

/*** Check whether an unknown failure carries a Node.js error code. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/*** Check whether an unknown value is a plain record-shaped object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Read and trim a non-empty string value from package metadata. */
function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

const NEXT_AGENTS_BLOCK_PATTERN =
  /<!-- BEGIN:nextjs-agent-rules -->\r?\n[\s\S]*?<!-- END:nextjs-agent-rules -->/u;
