import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type {
  RepositoryImplementationRef,
  RepositoryMetadata,
  RepositoryMetadataArchitecture,
  RepositoryMetadataConstraints,
  RepositoryMetadataKind,
} from '@ankhorage/contracts/metadata';
import {
  evaluateRepositoryMetadataPreflight,
  REPOSITORY_RULE_METADATA,
} from '@ankhorage/rules-repository';
import { isRecord } from '@ankhorage/utility/object';

import type { DevtoolsRepositoryCommandContext } from '../../../types/provider-command.js';

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
    const fact = await readMetadataFactAsync(targetDirectory);

    if (operation === 'init' && !fact.exists) {
      const result = await initializeMetadataAsync(targetDirectory, fact.path, input.dryRun);
      context.writeStdout(`${result} ${fact.path}\n`);
    }

    const status = await readMetadataFactAsync(targetDirectory);
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

interface MetadataFact {
  readonly document: RepositoryMetadata | undefined;
  readonly exists: boolean;
  readonly path: string;
  readonly profile: 'non-source' | 'source';
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

/*** Discover the profile-owned metadata location and parse only structurally recognizable JSON. */
async function readMetadataFactAsync(targetDirectory: string): Promise<MetadataFact> {
  const profile = (await pathExistsAsync(join(targetDirectory, 'src'))) ? 'source' : 'non-source';
  const path =
    profile === 'source'
      ? REPOSITORY_RULE_METADATA.metadata.profiles.source.canonicalPath
      : REPOSITORY_RULE_METADATA.metadata.profiles.nonSource.canonicalPath;
  const metadataPath = join(targetDirectory, path);
  if (!(await pathExistsAsync(metadataPath)))
    return { document: undefined, exists: false, path, profile };
  return {
    document: parseRepositoryMetadata(await readFile(metadataPath, 'utf8')),
    exists: true,
    path,
    profile,
  };
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

/*** Decode a document enough for Rules to produce diagnostic findings without claiming semantic truth. */
function parseRepositoryMetadata(text: string): RepositoryMetadata | undefined {
  const parsed: unknown = JSON.parse(text);
  if (!isRecord(parsed) || parsed.schemaVersion !== 1 || !isMetadataKind(parsed.kind))
    return undefined;
  if (
    typeof parsed.title !== 'string' ||
    typeof parsed.summary !== 'string' ||
    typeof parsed.purpose !== 'string'
  ) {
    return undefined;
  }
  return {
    schemaVersion: 1,
    kind: parsed.kind,
    title: parsed.title,
    summary: parsed.summary,
    purpose: parsed.purpose,
    ...optionalMetadataFields(parsed),
  };
}

/*** Preserve recognizable optional Contract fields so Rules can report their semantic findings. */
function optionalMetadataFields(
  metadata: Record<string, unknown>,
): Omit<RepositoryMetadata, 'kind' | 'purpose' | 'schemaVersion' | 'summary' | 'title'> {
  return {
    ...(typeof metadata.domain === 'string' ? { domain: metadata.domain } : {}),
    ...optionalTextCollections(metadata),
    ...optionalArchitectureField(metadata.architecture),
    ...optionalImplementsField(metadata.implements),
    ...optionalConstraintsField(metadata.constraints),
  };
}

/*** Read optional authored text collections without widening untrusted JSON values. */
function optionalTextCollections(
  metadata: Record<string, unknown>,
): Partial<Pick<RepositoryMetadata, 'audience' | 'boundaries' | 'responsibilities' | 'useCases'>> {
  const responsibilities = readStringArray(metadata.responsibilities);
  const boundaries = readStringArray(metadata.boundaries);
  const audience = readStringArray(metadata.audience);
  const useCases = readStringArray(metadata.useCases);
  return {
    ...(responsibilities === undefined ? {} : { responsibilities }),
    ...(boundaries === undefined ? {} : { boundaries }),
    ...(audience === undefined ? {} : { audience }),
    ...(useCases === undefined ? {} : { useCases }),
  };
}

/*** Read an optional architecture fact only when all recognized subfields are safely shaped. */
function optionalArchitectureField(
  value: unknown,
): Partial<Pick<RepositoryMetadata, 'architecture'>> {
  if (!isRecord(value)) return {};
  const architecture: RepositoryMetadataArchitecture = {
    ...(typeof value.role === 'string' ? { role: value.role } : {}),
    ...(Array.isArray(value.invariants) &&
    value.invariants.every((item) => typeof item === 'string')
      ? { invariants: value.invariants }
      : {}),
  };
  return Object.keys(architecture).length > 0 ? { architecture } : {};
}

/*** Read implementation references so their public-shape rules remain observable to authors. */
function optionalImplementsField(value: unknown): Partial<Pick<RepositoryMetadata, 'implements'>> {
  if (!Array.isArray(value)) return {};
  const implementations = value.map(parseImplementationReference);
  return implementations.every((implementation) => implementation !== undefined)
    ? { implements: implementations }
    : {};
}

/*** Decode one Contract-shaped implementation reference from authored JSON. */
function parseImplementationReference(value: unknown): RepositoryImplementationRef | undefined {
  if (!isRecord(value) || typeof value.packageName !== 'string') return undefined;
  if (value.subpath !== undefined && typeof value.subpath !== 'string') return undefined;
  if (value.interfaceId !== undefined && typeof value.interfaceId !== 'string') return undefined;
  return {
    packageName: value.packageName,
    ...(typeof value.subpath === 'string' ? { subpath: value.subpath } : {}),
    ...(typeof value.interfaceId === 'string' ? { interfaceId: value.interfaceId } : {}),
  };
}

/*** Read optional platform and operational constraints without accepting malformed child lists. */
function optionalConstraintsField(
  value: unknown,
): Partial<Pick<RepositoryMetadata, 'constraints'>> {
  if (!isRecord(value)) return {};
  const constraints: RepositoryMetadataConstraints = {
    ...(readStringArray(value.platforms) === undefined
      ? {}
      : { platforms: readStringArray(value.platforms) }),
    ...(readStringArray(value.configuration) === undefined
      ? {}
      : { configuration: readStringArray(value.configuration) }),
    ...(readStringArray(value.security) === undefined
      ? {}
      : { security: readStringArray(value.security) }),
    ...(readStringArray(value.limitations) === undefined
      ? {}
      : { limitations: readStringArray(value.limitations) }),
  };
  return Object.keys(constraints).length > 0 ? { constraints } : {};
}

/*** Read one Contract-compatible string-array shape from authored JSON. */
function readStringArray(value: unknown): readonly string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string')
    ? value
    : undefined;
}

/*** Recognize the portable Contract's closed metadata-kind vocabulary. */
function isMetadataKind(value: unknown): value is RepositoryMetadataKind {
  return (
    typeof value === 'string' &&
    [
      'adapter',
      'application',
      'configuration',
      'contract',
      'infrastructure',
      'library',
      'tooling',
      'website',
    ].includes(value)
  );
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
