import { readFile } from 'node:fs/promises';

export async function renderWorkflowAsync(
  sourceUrl: URL,
  policy: { readonly bunVersion: string; readonly nodeVersion: string },
): Promise<string> {
  const template = await readFile(sourceUrl, 'utf8');
  return template
    .replaceAll(BUN_VERSION_TOKEN, policy.bunVersion)
    .replaceAll(NODE_VERSION_TOKEN, policy.nodeVersion);
}

const BUN_VERSION_TOKEN = '__ANKH_BUN_VERSION__';
const NODE_VERSION_TOKEN = '__ANKH_NODE_VERSION__';
