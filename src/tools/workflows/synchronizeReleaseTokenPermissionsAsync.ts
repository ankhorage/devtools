import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { parseAllDocuments } from 'yaml';

type ReleaseTokenPermissionOperation = 'status' | 'sync';

type ReleaseTokenPermissionOperationResult =
  | { readonly relativePath: string; readonly state: 'current' | 'outdated' }
  | {
      readonly relativePath: string;
      readonly action: 'unchanged' | 'updated' | 'would-update';
    };

interface WorkflowStep {
  readonly contents: string;
  readonly start: number;
}

interface WorkflowJob {
  readonly contents: string;
  readonly start: number;
}

const RELEASE_WORKFLOW_PATH = '.github/workflows/release.yml';
const APP_TOKEN_USES = 'uses: actions/create-github-app-token@';
const APP_TOKEN_ACTION =
  '        uses: actions/create-github-app-token@bcd2ba49218906704ab6c1aa796996da409d3eb1 # v3.2.0';
const RELEASE_TOKEN_NAME = 'Create the scoped release token';
const ROLLOUT_TOKEN_NAME = 'Create the scoped rollout token';

/*** Validate and selectively synchronize only the two scoped release-token workflow permissions. */
export async function synchronizeReleaseTokenPermissionsAsync(input: {
  readonly targetDirectory: string;
  readonly operation: ReleaseTokenPermissionOperation;
  readonly dryRun: boolean;
}): Promise<ReleaseTokenPermissionOperationResult> {
  const workflowPath = join(input.targetDirectory, RELEASE_WORKFLOW_PATH);
  const workflow = await readFile(workflowPath, 'utf8');
  const updatedWorkflow = synchronizeWorkflowPermissions(workflow);
  const changed = updatedWorkflow !== workflow;

  if (input.operation === 'status') {
    return { relativePath: RELEASE_WORKFLOW_PATH, state: changed ? 'outdated' : 'current' };
  }
  if (!changed) return { relativePath: RELEASE_WORKFLOW_PATH, action: 'unchanged' };
  if (input.dryRun) return { relativePath: RELEASE_WORKFLOW_PATH, action: 'would-update' };

  await writeFile(workflowPath, updatedWorkflow, 'utf8');
  return { relativePath: RELEASE_WORKFLOW_PATH, action: 'updated' };
}

/*** Recognize the canonical GitHub Actions token topology before changing a permission line. */
function synchronizeWorkflowPermissions(workflow: string): string {
  assertValidWorkflowYaml(workflow);
  assertUnixLineEndings(workflow);
  const release = getJob(workflow, 'release');
  const finalize = getJob(workflow, 'finalize');
  const releaseToken = getNamedStep(release, RELEASE_TOKEN_NAME);
  const finalizeToken = getNamedStep(finalize, RELEASE_TOKEN_NAME);
  const rolloutToken = getNamedStep(finalize, ROLLOUT_TOKEN_NAME);

  assertExpectedTokenTopology(workflow, releaseToken, finalizeToken, rolloutToken);
  return addMissingWorkflowPermissions(workflow, [releaseToken, finalizeToken]);
}

/*** Parse the complete workflow before inspecting its security-sensitive token topology. */
function assertValidWorkflowYaml(workflow: string): void {
  const documents = parseAllDocuments(workflow, { uniqueKeys: true });
  if (documents.length !== 1) {
    throw new Error('Release workflow YAML must contain exactly one document.');
  }
  const [document] = documents;
  if (document.errors.length > 0) {
    throw new Error(
      `Release workflow YAML is invalid: ${document.errors.map(({ message }) => message).join('; ')}`,
    );
  }
}

/*** Refuse line endings that would make byte-preserving permission insertion ambiguous. */
function assertUnixLineEndings(workflow: string): void {
  if (workflow.includes('\r')) {
    throw new Error('Release workflow must use LF line endings for selective permission sync.');
  }
}

/*** Locate exactly one top-level GitHub Actions job without accepting a duplicate job definition. */
function getJob(workflow: string, jobName: 'release' | 'finalize'): WorkflowJob {
  const jobsIndex = workflow.indexOf('\njobs:\n');
  if (jobsIndex === -1 || workflow.slice(jobsIndex + 1).includes('\njobs:\n')) {
    throw new Error('Release workflow must contain exactly one top-level jobs mapping.');
  }
  const jobMatcher = new RegExp(`^ {2}${jobName}:\\n`, 'gmu');
  const matches = [...workflow.matchAll(jobMatcher)];
  const match = matches.at(0);
  if (matches.length !== 1 || match === undefined || match.index < jobsIndex) {
    throw new Error(`Release workflow must contain exactly one ${jobName} job.`);
  }

  const start = match.index;
  const nextJob = /^ {2}[A-Za-z][A-Za-z0-9-]*:\n/gmu;
  nextJob.lastIndex = start + 1;
  const end = nextJob.exec(workflow)?.index ?? workflow.length;
  return { contents: workflow.slice(start, end), start };
}

/*** Locate a unique, complete workflow step by its canonical name. */
function getNamedStep(job: WorkflowJob, stepName: string): WorkflowStep {
  const marker = `      - name: ${stepName}\n`;
  const first = job.contents.indexOf(marker);
  if (countLine(job.contents, marker.trimEnd()) !== 1) {
    throw new Error(`Expected exactly one ${stepName} step.`);
  }
  const next = job.contents.indexOf('\n      - ', first + marker.length);
  return {
    contents: job.contents.slice(first, next === -1 ? job.contents.length : next),
    start: job.start + first,
  };
}

/*** Prove the only GitHub App tokens are the two release tokens and one contents-only rollout token. */
function assertExpectedTokenTopology(
  workflow: string,
  releaseToken: WorkflowStep,
  finalizeToken: WorkflowStep,
  rolloutToken: WorkflowStep,
): void {
  const appTokenCalls = workflow.match(new RegExp(`^        ${APP_TOKEN_USES}`, 'gmu')) ?? [];
  if (appTokenCalls.length !== 3) {
    throw new Error(
      'Release workflow must contain exactly three scoped GitHub App token definitions.',
    );
  }
  assertReleaseToken(releaseToken.contents);
  assertReleaseToken(finalizeToken.contents);
  assertRolloutToken(rolloutToken.contents);
}

/*** Validate that a release token has only the canonical repository ownership and permissions. */
function assertReleaseToken(step: string): void {
  assertStepValues(
    step,
    RELEASE_TOKEN_NAME,
    'release-token',
    '${{ github.event.repository.name }}',
  );
  assertPermissionLines(step, true);
}

/*** Validate that the rollout token remains limited to the dedicated Renovate repository. */
function assertRolloutToken(step: string): void {
  assertStepValues(step, ROLLOUT_TOKEN_NAME, 'rollout-token', 'renovate');
  assertPermissionLines(step, false);
}

/*** Require exact single-valued identifiers and repository ownership in one App-token step. */
function assertStepValues(step: string, name: string, id: string, repository: string): void {
  const requiredLines = [
    `      - name: ${name}`,
    `        id: ${id}`,
    APP_TOKEN_ACTION,
    '        with:',
    '          client-id: ${{ vars.ANKHORAGE_RENOVATE_SYNC_CLIENT_ID }}',
    '          private-key: ${{ secrets.ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY }}',
    '          owner: ankhorage',
    `          repositories: ${repository}`,
  ];
  for (const line of requiredLines) {
    if (countLine(step, line) !== 1) {
      throw new Error(`Unexpected scoped token definition: expected one ${line.trim()}.`);
    }
  }
  assertRecognizedStepSyntax(step, requiredLines);
}

/*** Reject unrecognized fields so duplicate ownership or action substitutions cannot broaden a token. */
function assertRecognizedStepSyntax(step: string, requiredLines: readonly string[]): void {
  const recognizedLines = new Set([
    ...requiredLines,
    '        continue-on-error: true',
    '          permission-contents: write',
    '          permission-workflows: write',
    '',
  ]);
  if (!step.split('\n').every((line) => recognizedLines.has(line))) {
    throw new Error('Unexpected syntax in scoped token definition.');
  }
  if (
    step.split('\n').filter((line) => line.startsWith(`        ${APP_TOKEN_USES}`)).length !== 1
  ) {
    throw new Error('Unexpected scoped token definition: expected one GitHub App token action.');
  }
}

/*** Reject unknown, duplicate, or broadened App-token permission declarations. */
function assertPermissionLines(step: string, allowsWorkflowPermission: boolean): void {
  const permissions = step.match(/^ {10}permission-[^\n]+$/gmu) ?? [];
  const expected = allowsWorkflowPermission
    ? ['          permission-contents: write', '          permission-workflows: write']
    : ['          permission-contents: write'];
  if (!permissions.every((line) => expected.includes(line)) || countLine(step, expected[0]) !== 1) {
    throw new Error(
      'Scoped token permissions must use only the recognized contents and workflows writes.',
    );
  }
  if (allowsWorkflowPermission && countLine(step, expected[1]) > 1) {
    throw new Error('Scoped release token has duplicate workflows permission.');
  }
  if (!allowsWorkflowPermission && permissions.length !== 1) {
    throw new Error('Scoped rollout token must remain contents-only.');
  }
}

/*** Insert only missing release-token workflow permissions, preserving every other byte. */
function addMissingWorkflowPermissions(workflow: string, tokens: readonly WorkflowStep[]): string {
  const additions = tokens
    .filter((token) => !token.contents.includes('          permission-workflows: write\n'))
    .map((token) => token.start + token.contents.indexOf('          permission-contents: write\n'))
    .sort((left, right) => right - left);
  return additions.reduce(
    (current, index) =>
      `${current.slice(0, index + '          permission-contents: write\n'.length)}          permission-workflows: write\n${current.slice(index + '          permission-contents: write\n'.length)}`,
    workflow,
  );
}

/*** Count an exact workflow line to reject duplicate structural declarations. */
function countLine(contents: string, line: string): number {
  return contents.split('\n').filter((candidate) => candidate === line).length;
}
