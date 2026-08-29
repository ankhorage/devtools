import { readFile } from 'node:fs/promises';

import { changesetsPolicy } from '../../policy/changesetsPolicy.js';

export async function renderWorkflowAsync(
  sourceUrl: URL,
  policy: { readonly bunVersion: string; readonly nodeVersion: string },
): Promise<string> {
  const template = await readFile(sourceUrl, 'utf8');
  return template
    .replaceAll(BUN_VERSION_TOKEN, policy.bunVersion)
    .replaceAll(CHANGESETS_PUBLISH_COMMAND_TOKEN, changesetsPolicy.workflowCommands.publish)
    .replaceAll(CHANGESETS_STATUS_COMMAND_TOKEN, changesetsPolicy.workflowCommands.status)
    .replaceAll(
      CHANGESETS_VERSION_PACKAGES_BASE_BRANCH_COMMAND_TOKEN,
      changesetsPolicy.workflowCommands.versionPackagesBaseBranch,
    )
    .replaceAll(
      CHANGESETS_VERSION_PACKAGES_STATUS_COMMAND_TOKEN,
      changesetsPolicy.workflowCommands.versionPackagesStatus,
    )
    .replaceAll(CHANGESETS_VERSION_COMMAND_TOKEN, changesetsPolicy.workflowCommands.version)
    .replaceAll(NODE_VERSION_TOKEN, policy.nodeVersion);
}

const BUN_VERSION_TOKEN = '__ANKH_BUN_VERSION__';
const CHANGESETS_PUBLISH_COMMAND_TOKEN = '__ANKH_CHANGESETS_PUBLISH_COMMAND__';
const CHANGESETS_STATUS_COMMAND_TOKEN = '__ANKH_CHANGESETS_STATUS_COMMAND__';
const CHANGESETS_VERSION_PACKAGES_BASE_BRANCH_COMMAND_TOKEN =
  '__ANKH_CHANGESETS_VERSION_PACKAGES_BASE_BRANCH_COMMAND__';
const CHANGESETS_VERSION_PACKAGES_STATUS_COMMAND_TOKEN =
  '__ANKH_CHANGESETS_VERSION_PACKAGES_STATUS_COMMAND__';
const CHANGESETS_VERSION_COMMAND_TOKEN = '__ANKH_CHANGESETS_VERSION_COMMAND__';
const NODE_VERSION_TOKEN = '__ANKH_NODE_VERSION__';
