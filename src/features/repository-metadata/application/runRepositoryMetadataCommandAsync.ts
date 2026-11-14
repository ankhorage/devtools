import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { RepositoryMetadata } from '@ankhorage/contracts/metadata';
import { evaluateRepositoryMetadataPreflight } from '@ankhorage/rules-repository';
import { isRecord } from '@ankhorage/utility/object';

import type { DevtoolsRepositoryCommandContext } from '../../../types/provider-command.js';
import { readRepositoryMetadataFactAsync } from './readRepositoryMetadataFactAsync.js';

/*** Initialize or inspect authored repository metadata without turning it into an enforcement gate. */
export async function runRepositoryMetadataCommandAsync(
  operation: 'init' | 'status',
  argv: readonly string[],
  context: DevtoolsRepositoryCommandContext,
): Promise<{ readonly exitCode: number }> {
  try {
    const input = parseMetadataArguments(argv, operation === 'init');
    const targetDirectory = resolve(context.cwd, input.targetPath ?? '.');
    await assertDirectoryAsync(targetDirectory);
    const fact = await readRepositoryMetadataFactAsync(targetDirectory);

    if (operation === 'init' && !fact.exists) {
      const result = await initializeMetadataAsync(targetDirectory, fact.path, input.dryRun);
      context.writeStdout(`${result} ${fact.path}\n`);
    }

    const status = await readRepositoryMetadataFactAsync(targetDirectory);
    const evaluation = evaluateRepositoryMetadataPreflight({
      cliCommands: [],
      imports: [],
      metadata: { ...status, eligibility: 'applicable', managed: true },
      packageJson: { dependencies: [], exports: [], fields: {}, scripts: {} },
      paths: [],
      workflowBunVersions: {},
    });
    const tasks = authoredTasks(status.document);
    writeMetadataStatus(evaluation.findings, tasks, status.path, context);
    return { exitCode: evaluation.findings.length === 0 && tasks.length === 0 ? 0 : 1 };
  } catch (error) {
    context.writeStderr(`${getErrorMessage(error)}\n`);
    return { exitCode: 1 };
  }
}

interface MetadataArguments {
  readonly dryRun: boolean;
  readonly targetPath: string | undefined;
}

/*** Parse deterministic metadata command arguments without consulting network or ambient configuration. */
function parseMetadataArguments(argv: readonly string[], allowDryRun: boolean): MetadataArguments {
  let dryRun = false;
  let targetPath: string | undefined;
  for (const argument of argv) {
    if (argument === '--dry-run') {
      if (!allowDryRun) throw new Error('--dry-run is only valid for metadata init.');
      dryRun = true;
    } else if (argument.startsWith('-')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (targetPath === undefined) {
      targetPath = argument;
    } else {
      throw new Error('Only one target path may be provided.');
    }
  }
  return { dryRun, targetPath };
}

/*** Require a local directory before any metadata inspection or initialization. */
async function assertDirectoryAsync(targetDirectory: string): Promise<void> {
  await access(targetDirectory);
}

/*** Create an intentionally incomplete authored template only when metadata is absent. */
async function initializeMetadataAsync(
  targetDirectory: string,
  relativePath: string,
  dryRun: boolean,
): Promise<string> {
  const destination = join(targetDirectory, relativePath);
  if (dryRun) return '+';
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(
    destination,
    `${JSON.stringify(await metadataTemplateAsync(targetDirectory), null, 2)}\n`,
  );
  return '+';
}

/*** Build a template from only independently verifiable local repository facts. */
async function metadataTemplateAsync(targetDirectory: string): Promise<unknown> {
  const manifest = await readManifestAsync(targetDirectory);
  return {
    schemaVersion: 1,
    title: typeof manifest.name === 'string' ? manifest.name : '',
    summary: '',
    purpose: '',
  };
}

/*** Read package metadata defensively; absence never fabricates author-owned content. */
async function readManifestAsync(targetDirectory: string): Promise<Record<string, unknown>> {
  const manifestPath = join(targetDirectory, 'package.json');
  if (!(await pathExistsAsync(manifestPath))) return {};
  const parsed: unknown = JSON.parse(await readFile(manifestPath, 'utf8'));
  return isRecord(parsed) ? parsed : {};
}

/*** Identify human-authored fields that deliberately remain absent from the bootstrap template. */
function authoredTasks(document: RepositoryMetadata | undefined): readonly string[] {
  if (document === undefined) return ['create structurally valid repository metadata'];
  return [
    ...(document.summary.trim() === '' ? ['author summary'] : []),
    ...(document.purpose.trim() === '' ? ['author purpose'] : []),
  ];
}

/*** Render preflight findings and ownership tasks as deterministic actionable CLI output. */
function writeMetadataStatus(
  findings: readonly {
    readonly message: string;
    readonly subjects: readonly { readonly path?: string }[];
  }[],
  tasks: readonly string[],
  path: string,
  context: DevtoolsRepositoryCommandContext,
): void {
  for (const finding of findings)
    context.writeStdout(`! ${finding.subjects[0]?.path ?? path} ${finding.message}\n`);
  for (const task of tasks) context.writeStdout(`? ${path} ${task}\n`);
  if (findings.length === 0 && tasks.length === 0) context.writeStdout(`✓ ${path} current\n`);
}

/*** Test one local path without shelling out or consulting external state. */
async function pathExistsAsync(path: string): Promise<boolean> {
  return await access(path).then(
    () => true,
    () => false,
  );
}

/*** Normalize any boundary error for the CLI adapter. */
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
