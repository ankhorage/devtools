/*** Public CI-impact planning and GitHub Actions output boundary. */
export {
  type CiImpactConfiguration,
  type CiImpactJobDecision,
  type CiImpactKind,
  type CiImpactMode,
  type CiImpactPlan,
  type CiImpactSelection,
  type CiImpactSuite,
  type CiImpactWorkflowOutput,
  createCiImpactWorkflowOutput,
  planCiImpact,
  runCiImpact,
} from './features/ci-impact/ciImpact.js';
