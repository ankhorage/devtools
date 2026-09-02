import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { renderWorkflowAsync, type WorkflowPolicy } from './renderWorkflowAsync.js';

/*** Renders the canonical workflow while retaining Renovate's exact trusted digest. */
export async function renderRenovateWorkflowAsync(
  sourceUrl: URL,
  targetDirectory: string,
  policy: WorkflowPolicy,
): Promise<string> {
  const template = await renderWorkflowAsync(sourceUrl, policy);
  readSingleRenovateWorkflowDigest(template, 'Devtools workflow template');
  const target = await readOptionalWorkflowAsync(
    resolve(targetDirectory, RENOVATE_WORKFLOW_RELATIVE_PATH),
  );
  if (target === null) return template;

  const digest = readSingleRenovateWorkflowDigest(target, 'target workflow');
  return template.replace(
    RENOVATE_WORKFLOW_REFERENCE_PATTERN,
    (_reference, prefix: string, _templateDigest: string, suffix: string) =>
      `${prefix}${digest}${suffix}`,
  );
}

/*** Reads one exact immutable digest from the canonical Renovate workflow reference. */
function readSingleRenovateWorkflowDigest(contents: string, source: string): string {
  const matches = [...contents.matchAll(RENOVATE_WORKFLOW_REFERENCE_PATTERN)];
  const digest = matches.length === 1 ? matches[0]?.[2] : undefined;
  if (digest === undefined) {
    throw new Error(`Expected exactly one immutable Renovate digest in the ${source}.`);
  }
  return digest;
}

/*** Reads an existing managed workflow without treating first-time creation as an error. */
async function readOptionalWorkflowAsync(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return null;
    throw error;
  }
}

/*** Narrows filesystem failures to Node errors with stable codes. */
function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

const RENOVATE_WORKFLOW_REFERENCE_PATTERN =
  /^([ \t]*uses:[ \t]+ankhorage\/renovate\/\.github\/workflows\/changeset\.yml@)([0-9a-f]{40})([ \t]*)$/gmu;
const RENOVATE_WORKFLOW_RELATIVE_PATH = '.github/workflows/renovate.yml';
