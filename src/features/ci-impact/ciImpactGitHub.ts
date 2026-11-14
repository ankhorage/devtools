import { appendFileSync } from 'node:fs';

import type { CiImpactPlan, CiImpactWorkflowOutput } from './ciImpact.js';

/*** Write JSON-safe records so external workflows can address arbitrary script identifiers. */
export function writeCiImpactGitHubOutputs(
  output: CiImpactWorkflowOutput,
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (environment.GITHUB_OUTPUT === undefined) return;
  const { plan } = output;
  appendFileSync(
    environment.GITHUB_OUTPUT,
    [
      'impact=' + JSON.stringify(output),
      'unit=' + plan.unit.mode,
      'e2e=' + plan.e2e.mode,
      'smoke=' + plan.smoke.mode,
    ].join('\n') + '\n',
  );
}

/*** Render the existing aggregate plan in the GitHub Actions step summary. */
export function writeCiImpactGitHubSummary(
  plan: CiImpactPlan,
  environment: Readonly<Record<string, string | undefined>>,
): void {
  if (environment.GITHUB_STEP_SUMMARY === undefined) return;
  appendFileSync(
    environment.GITHUB_STEP_SUMMARY,
    '### CI impact\n\n| Suite | Mode | Reason | Scripts |\n| --- | --- | --- | --- |\n' +
      (['unit', 'e2e', 'smoke'] as const)
        .map(
          (kind) =>
            '| ' +
            kind +
            ' | ' +
            plan[kind].mode +
            ' | ' +
            plan[kind].reason +
            ' | ' +
            (plan[kind].scripts.join(', ') || '—') +
            ' |',
        )
        .join('\n') +
      '\n',
  );
}
