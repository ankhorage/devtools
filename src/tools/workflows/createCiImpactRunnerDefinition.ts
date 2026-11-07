import type { ManagedFileDefinition } from '../../features/managed-files/managedFiles.js';

/*** Create the CI impact runner only when the canonical managed CI workflow dispatches it. */
export function createCiImpactRunnerDefinition(
  ciWorkflow: ManagedFileDefinition,
): ManagedFileDefinition {
  return {
    relativePath: CI_IMPACT_RUNNER_PATH,
    sourceUrl: new URL('./files/ci-impact.ts', import.meta.url),
    isApplicable: async (targetDirectory) => {
      if (ciWorkflow.render === undefined) {
        throw new Error('The managed CI workflow must be rendered to determine CI impact support.');
      }
      return hasCiImpactWorkflowSteps(await ciWorkflow.render(targetDirectory));
    },
  };
}

const CI_IMPACT_RUNNER_PATH = '.github/scripts/ci-impact.ts';
const CI_IMPACT_WORKFLOW_MARKERS = [
  'id: impact',
  'bun .github/scripts/ci-impact.ts plan',
  'bun .github/scripts/ci-impact.ts unit',
  'bun .github/scripts/ci-impact.ts e2e',
  'bun .github/scripts/ci-impact.ts smoke',
] as const;

/*** Require planning and every conditional test dispatch before synchronizing the runner. */
function hasCiImpactWorkflowSteps(workflow: string): boolean {
  return CI_IMPACT_WORKFLOW_MARKERS.every((marker) => workflow.includes(marker));
}
