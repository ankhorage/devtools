import type { BunPolicy } from '../types/bunPolicy.js';

/*** Render the managed Bun policy section while preserving the surrounding guide. */
export function renderBunPolicyDocumentation(readme: string, policy: BunPolicy): string {
  const startIndex = readme.indexOf(README_POLICY_START);
  const endIndex = readme.indexOf(README_POLICY_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('README.md must contain one ordered Devtools Bun policy marker pair.');
  }
  if (
    readme.includes(README_POLICY_START, startIndex + README_POLICY_START.length) ||
    readme.includes(README_POLICY_END, endIndex + README_POLICY_END.length)
  ) {
    throw new Error('README.md must contain exactly one Devtools Bun policy marker pair.');
  }

  const replacement = `${README_POLICY_START}\n\n${renderReadmePolicy(policy)}\n\n${README_POLICY_END}`;
  return `${readme.slice(0, startIndex)}${replacement}${readme.slice(
    endIndex + README_POLICY_END.length,
  )}`;
}

/*** Format canonical runtime and type-package versions for the guide. */
function renderReadmePolicy(policy: BunPolicy): string {
  return `\`\`\`text
Bun runtime       ${policy.version}
packageManager    ${policy.packageManager}
@types/bun        ${policy.typesRange}
\`\`\``;
}

const README_POLICY_END = '<!-- devtools-bun-policy:end -->';
const README_POLICY_START = '<!-- devtools-bun-policy:start -->';
