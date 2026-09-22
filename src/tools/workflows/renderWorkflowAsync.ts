import { readFile } from 'node:fs/promises';

import { changesetsPolicy } from '../../policy/changesetsPolicy.js';

export interface WorkflowPolicy {
  readonly bunVersion: string;
  readonly doctorVersion: string;
  readonly nodeVersion: string;
  readonly apmReleaseCommand?: string;
  readonly pkgvizAudit?: {
    readonly artifactName: string;
    readonly artifactPath: string;
    readonly command: string;
  };
  readonly structureReleaseCommand?: string;
}

/*** Renders one workflow template with the canonical runtime, Doctor, and Changesets policy. */
export async function renderWorkflowAsync(sourceUrl: URL, policy: WorkflowPolicy): Promise<string> {
  const template = await readFile(sourceUrl, 'utf8');
  return template
    .replaceAll(BUN_VERSION_TOKEN, policy.bunVersion)
    .replaceAll(PKGVIZ_AUDIT_STEPS_TOKEN, renderPkgvizAuditSteps(policy))
    .replaceAll(CHANGESETS_PUBLISH_COMMAND_TOKEN, changesetsPolicy.workflowCommands.publish)
    .replaceAll(CHANGESETS_STATUS_COMMAND_TOKEN, changesetsPolicy.workflowCommands.status)
    .replaceAll(CHANGESETS_VERSION_COMMAND_TOKEN, changesetsPolicy.workflowCommands.version)
    .replaceAll(DOCTOR_VERSION_TOKEN, policy.doctorVersion)
    .replaceAll(
      '__ANKH_APM_RELEASE_COMMAND__',
      policy.apmReleaseCommand ?? './node_modules/.bin/ankhorage-apm-release',
    )
    .replaceAll(
      '__ANKH_STRUCTURE_RELEASE_COMMAND__',
      policy.structureReleaseCommand ?? './node_modules/.bin/ankhorage-structure',
    )
    .replaceAll(NODE_VERSION_TOKEN, policy.nodeVersion);
}

const BUN_VERSION_TOKEN = '__ANKH_BUN_VERSION__';
const CHANGESETS_PUBLISH_COMMAND_TOKEN = '__ANKH_CHANGESETS_PUBLISH_COMMAND__';
const CHANGESETS_STATUS_COMMAND_TOKEN = '__ANKH_CHANGESETS_STATUS_COMMAND__';
const CHANGESETS_VERSION_COMMAND_TOKEN = '__ANKH_CHANGESETS_VERSION_COMMAND__';
const DOCTOR_VERSION_TOKEN = '__ANKH_DOCTOR_VERSION__';
const NODE_VERSION_TOKEN = '__ANKH_NODE_VERSION__';

/*** Render the centrally managed PKGViz audit steps only for applicable repositories. */
function renderPkgvizAuditSteps(policy: WorkflowPolicy): string {
  if (policy.pkgvizAudit === undefined) return '';

  return `      - name: Enforce PKGViz cyclic-dependencies rule
        run: ${policy.pkgvizAudit.command}

      - name: Upload PKGViz audit
        if: always() && hashFiles('${policy.pkgvizAudit.artifactPath}') != ''
        uses: actions/upload-artifact@v4
        with:
          name: ${policy.pkgvizAudit.artifactName}
          path: ${policy.pkgvizAudit.artifactPath}
`;
}

const PKGVIZ_AUDIT_STEPS_TOKEN = '      # __ANKH_PKGVIZ_AUDIT_STEPS__';
