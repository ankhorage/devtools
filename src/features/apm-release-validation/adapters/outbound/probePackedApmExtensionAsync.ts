import { execFile } from 'node:child_process';
import { readFile, symlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

import { isRecord } from '@ankhorage/utility/object';

import type {
  ApmPackedReleaseCandidate,
  ApmReleaseValidationOptions,
  ApmReleaseValidationResult,
} from '../../../../types/apm-release-validation.js';

/*** Load the native public ESM export in a bounded child process only after explicit owner-code consent. */
export async function probePackedApmExtensionAsync(
  input: ProbeInput,
): Promise<ApmReleaseValidationResult> {
  if (input.options.allowOwnerCode !== true) {
    return {
      applicable: true,
      valid: false,
      integrity: input.candidate.integrity,
      blockers: [
        'release.owner-code-consent: Executable owner validation requires --allow-owner-code.',
      ],
    };
  }
  const { probePath, resultPath } = await prepareProbeAsync(input);
  try {
    await execFileAsync(process.execPath, [probePath], {
      cwd: input.packageRoot,
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      env: {
        PATH: process.env.PATH,
        SYSTEMROOT: process.env.SYSTEMROOT,
        HOME: input.packageRoot,
        TMPDIR: input.packageRoot,
      },
    });
    return await readProbeResultAsync(input.candidate, resultPath);
  } catch {
    return {
      applicable: true,
      valid: false,
      integrity: input.candidate.integrity,
      blockers: [
        'release.extension-load: Packed public export failed to load or validate in the owner probe.',
      ],
    };
  }
}

/*** Materialize a probe that uses native self-reference export resolution in the extracted package. */
async function prepareProbeAsync(
  input: ProbeInput,
): Promise<{ readonly probePath: string; readonly resultPath: string }> {
  const requestPath = resolve(input.packageRoot, '.apm-release-request.json');
  const resultPath = resolve(input.packageRoot, '.apm-release-result.json');
  const probePath = resolve(input.packageRoot, '.apm-release-probe.mjs');
  const specifier = `${String(input.candidate.packageJson.name)}${input.subpath.slice(1)}`;
  await symlink(input.dependencyRoot, resolve(input.packageRoot, 'node_modules'), 'dir');
  await writeFile(
    requestPath,
    JSON.stringify({ candidate: input.candidate, options: input.options }),
  );
  const validatorUrl = new URL('../../application/validateApmReleaseCandidate.js', import.meta.url)
    .href;
  await writeFile(
    probePath,
    [
      "import { readFile, writeFile } from 'node:fs/promises';",
      `import { validateApmReleaseCandidate } from ${JSON.stringify(validatorUrl)};`,
      `const request = JSON.parse(await readFile(${JSON.stringify(requestPath)}, 'utf8'));`,
      `const loaded = await import(${JSON.stringify(specifier)});`,
      'const result = validateApmReleaseCandidate({ ...request.candidate, extension: loaded.default }, request.options);',
      `await writeFile(${JSON.stringify(resultPath)}, JSON.stringify(result));`,
    ].join('\n'),
  );
  return { probePath, resultPath };
}

/*** Validate child-process response data before exposing a structured report. */
async function readProbeResultAsync(
  candidate: ApmPackedReleaseCandidate,
  resultPath: string,
): Promise<ApmReleaseValidationResult> {
  const result: unknown = JSON.parse(await readFile(resultPath, 'utf8'));
  if (
    !isRecord(result) ||
    typeof result.valid !== 'boolean' ||
    !Array.isArray(result.blockers) ||
    !result.blockers.every((value: unknown) => typeof value === 'string')
  ) {
    throw new Error('Invalid owner probe response.');
  }
  return {
    applicable: true,
    valid: result.valid,
    integrity: candidate.integrity,
    packageName: String(candidate.packageJson.name),
    packageVersion: String(candidate.packageJson.version),
    blockers: result.blockers,
  };
}

interface ProbeInput {
  readonly candidate: ApmPackedReleaseCandidate;
  readonly packageRoot: string;
  readonly dependencyRoot: string;
  readonly subpath: string;
  readonly options: ApmReleaseValidationOptions;
}
const execFileAsync = promisify(execFile);
