import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { writeCiImpactGitHubOutputs, writeCiImpactGitHubSummary } from './ciImpactGitHub.js';

export type CiImpactKind = 'e2e' | 'smoke';
export type CiImpactMode = 'skip' | 'full' | 'changed' | 'scoped';

export interface CiImpactSelection {
  readonly mode: CiImpactMode;
  readonly scripts: readonly string[];
  readonly reason: string;
}

export interface CiImpactPlan {
  readonly base: string;
  readonly unit: CiImpactSelection;
  readonly e2e: CiImpactSelection;
  readonly smoke: CiImpactSelection;
}

export interface CiImpactSuite {
  readonly kind: CiImpactKind;
  readonly script: string;
  readonly paths: readonly string[];
}

export interface CiImpactConfiguration {
  readonly complete?: Partial<Record<CiImpactKind, boolean>>;
  readonly suites?: readonly CiImpactSuite[];
}

export interface CiImpactJobDecision {
  readonly state: 'selected' | 'skipped' | 'full';
  readonly reason: string;
  readonly fallback: boolean;
}

export interface CiImpactWorkflowOutput {
  readonly version: 1;
  readonly plan: CiImpactPlan;
  readonly jobs: Readonly<Record<string, CiImpactJobDecision>>;
}

interface CiImpactManifest {
  readonly scripts?: Record<string, string>;
  readonly ankh?: { readonly ciImpact?: unknown };
}

interface CiImpactExecutionContext {
  readonly cwd?: string;
  readonly environment?: Readonly<Record<string, string | undefined>>;
}

type CiImpactOperation = 'plan' | 'unit' | CiImpactKind;

/*** Select safe CI checks, using explicit suite ownership and Bun's dependency graph. */
export function planCiImpact(
  files: readonly string[] | null,
  scripts: Readonly<Record<string, string | undefined>>,
  configuration: CiImpactConfiguration | undefined,
  base: string,
): CiImpactPlan {
  const full = files === null || files.some(isUnsafeChange);
  const docs = files?.every(isDocumentation) === true;
  const baseSelection: CiImpactSelection = {
    mode: full ? 'full' : 'skip',
    scripts: [],
    reason: full ? 'Unsafe or unavailable diff' : 'Documentation only',
  };
  const unit: CiImpactSelection =
    scripts.test === undefined
      ? { mode: 'skip', scripts: [], reason: 'No test script' }
      : full
        ? { mode: 'full', scripts: ['test'], reason: 'Unsafe or unavailable diff' }
        : docs
          ? baseSelection
          : scripts.test.trim() === 'bun test'
            ? { mode: 'changed', scripts: ['test'], reason: 'Bun transitive import graph' }
            : { mode: 'full', scripts: ['test'], reason: 'Unrecognized test runner' };

  return {
    base,
    unit,
    e2e: selectSuites('e2e', files, scripts, configuration, full, docs),
    smoke: selectSuites('smoke', files, scripts, configuration, full, docs),
  };
}

/*** Create safe, per-script GitHub Actions decisions from the canonical aggregate plan. */
export function createCiImpactWorkflowOutput(
  plan: CiImpactPlan,
  configuration: CiImpactConfiguration | undefined,
): CiImpactWorkflowOutput {
  const jobs = Object.fromEntries(
    (['e2e', 'smoke'] as const).flatMap((kind) =>
      suitesForKind(configuration, kind).map((suite) => [
        suite.script,
        createJobDecision(plan[kind], suite.script),
      ]),
    ),
  );

  return { version: 1, plan, jobs };
}

/*** Run the published CI impact command without evaluating repository values as shell commands. */
export function runCiImpact(argv: readonly string[], context: CiImpactExecutionContext = {}): void {
  const operation = parseOperation(argv);
  const cwd = context.cwd ?? process.cwd();
  const environment = context.environment ?? process.env;
  const planPath = join(environment.RUNNER_TEMP ?? '.', 'ankh-ci-impact-plan.json');

  if (operation === 'plan') {
    const { configuration, plan } = createPlan(cwd, environment);
    writeFileSync(planPath, JSON.stringify(plan), { encoding: 'utf8' });
    const output = createCiImpactWorkflowOutput(plan, configuration);
    writeCiImpactGitHubOutputs(output, environment);
    console.log(JSON.stringify(output, null, 2));
    writeCiImpactGitHubSummary(plan, environment);
    return;
  }

  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as CiImpactPlan;
  runPlan(plan, operation, cwd);
}

/*** Select scoped suites only when an exhaustive and unambiguous repository declaration is valid. */
function selectSuites(
  kind: CiImpactKind,
  files: readonly string[] | null,
  scripts: Readonly<Record<string, string | undefined>>,
  configuration: CiImpactConfiguration | undefined,
  full: boolean,
  docs: boolean,
): CiImpactSelection {
  const defaults = (kind === 'e2e' ? ['test:e2e'] : ['test:smoke', 'test:standalone']).filter(
    (name) => scripts[name] !== undefined,
  );
  const suites = suitesForKind(configuration, kind);
  const validSuites =
    suites.length > 0 &&
    new Set(suites.map((suite) => suite.script)).size === suites.length &&
    suites.every(
      (suite) =>
        typeof scripts[suite.script] === 'string' &&
        suite.paths.length > 0 &&
        suite.paths.every(isSafePattern),
    );
  const fallbackScripts =
    defaults.length > 0
      ? defaults
      : suites.map((suite) => suite.script).filter((script) => scripts[script] !== undefined);

  if (fallbackScripts.length === 0)
    return { mode: 'skip', scripts: [], reason: 'No suite scripts' };
  if (docs) return { mode: 'skip', scripts: [], reason: 'Documentation only' };
  if (full) return { mode: 'full', scripts: fallbackScripts, reason: 'Unsafe or unavailable diff' };
  if (configuration?.complete?.[kind] !== true || !validSuites) {
    return { mode: 'full', scripts: fallbackScripts, reason: 'No complete suite mapping' };
  }
  const matches = (files ?? []).map((file) =>
    suites.filter((suite) => suite.paths.some((pattern) => matchesPath(file, pattern))),
  );
  if (matches.some((found) => found.length !== 1)) {
    return { mode: 'full', scripts: fallbackScripts, reason: 'Ambiguous or unmapped changed file' };
  }
  return {
    mode: 'scoped',
    scripts: [...new Set(matches.flat().map((suite) => suite.script))],
    reason: 'Explicit complete suite mapping',
  };
}

/*** Read only well-formed suite declarations from untrusted package metadata. */
function suitesForKind(
  configuration: CiImpactConfiguration | undefined,
  kind: CiImpactKind,
): readonly CiImpactSuite[] {
  return configuration?.suites?.filter((suite) => suite.kind === kind) ?? [];
}

/*** Classify a declared script from the aggregate selection without allowing an implied pass. */
function createJobDecision(selection: CiImpactSelection, script: string): CiImpactJobDecision {
  if (selection.mode === 'full') {
    return { state: 'full', reason: selection.reason, fallback: true };
  }
  if (selection.mode === 'skip') {
    return { state: 'skipped', reason: selection.reason, fallback: false };
  }
  return selection.scripts.includes(script)
    ? { state: 'selected', reason: selection.reason, fallback: false }
    : { state: 'skipped', reason: selection.reason, fallback: false };
}

/*** Conservatively identify changes that invalidate impact pruning. */
function isUnsafeChange(file: string): boolean {
  return (
    /^(?:\.github\/|\.agents\/|scripts\/|tools\/|test\/|tests\/|config\/)/u.test(file) ||
    /(?:^|\/)[^/]*\.config\.[^/]+$/u.test(file) ||
    /(?:^|\/)(?:[^/]+\.lock|[^/]+\.lockb|(?:bun|package)-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/u.test(
      file,
    ) ||
    /^(?:package\.json|bunfig\.toml|AGENTS\.md|tsconfig[^/]*|playwright\.config\.[^/]+|vitest\.config\.[^/]+|jest\.config\.[^/]+|eslint\.config\.[^/]+|\.env[^/]*)$/u.test(
      file,
    )
  );
}

/*** Classify files whose changes cannot influence runtime test execution. */
function isDocumentation(file: string): boolean {
  return (
    file.startsWith('docs/') ||
    file.startsWith('.changeset/') ||
    (/\.(?:md|mdx)$/u.test(file) && !isUnsafeChange(file)) ||
    file === 'LICENSE'
  );
}

/*** Keep mapping syntax deliberately restricted to exact paths and directory descendants. */
function isSafePattern(pattern: string): boolean {
  return (
    !pattern.startsWith('/') &&
    !pattern.includes('..') &&
    /^(?:[a-zA-Z0-9_.@-]+\/)*[a-zA-Z0-9_.@*-]+$/u.test(pattern) &&
    (!pattern.includes('*') || pattern.endsWith('/**'))
  );
}

/*** Match one declared path or its explicit recursive directory ownership. */
function matchesPath(file: string, pattern: string): boolean {
  return pattern.endsWith('/**') ? file.startsWith(pattern.slice(0, -2)) : file === pattern;
}

/*** Read Git's binary-safe status output, failing closed for removals, renames, and invalid refs. */
function readChangedFiles(base: string, cwd: string): readonly string[] | null {
  if (!/^[a-f0-9]{40}$/u.test(base)) return null;
  try {
    execFileSync('git', ['cat-file', '-e', base + '^{commit}'], { cwd, stdio: 'ignore' });
    const output = execFileSync(
      'git',
      ['diff', '--name-status', '--no-renames', '-z', base, 'HEAD', '--'],
      { cwd, encoding: 'utf8' },
    );
    const items = output.split('\0').filter(Boolean);
    if (items.length % 2 !== 0) return null;
    const changes = Array.from({ length: items.length / 2 }, (_, index) => ({
      status: items[index * 2],
      path: items[index * 2 + 1],
    }));
    return changes.every((item) => /^[AMT]$/u.test(item.status) && !item.path.includes('\n'))
      ? changes.map((item) => item.path)
      : null;
  } catch {
    return null;
  }
}

/*** Produce a full plan when the workflow cannot prove a trustworthy PR delta. */
function createPlan(
  cwd: string,
  environment: Readonly<Record<string, string | undefined>>,
): {
  readonly configuration: CiImpactConfiguration | undefined;
  readonly plan: CiImpactPlan;
} {
  const manifest = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')) as CiImpactManifest;
  const base =
    environment.GITHUB_EVENT_NAME === 'pull_request' ? (environment.ANKH_CI_BASE_SHA ?? '') : '';
  const files = base ? readChangedFiles(base, cwd) : null;
  const configuration = parseCiImpactConfiguration(manifest.ankh?.ciImpact);
  return { configuration, plan: planCiImpact(files, manifest.scripts ?? {}, configuration, base) };
}

/*** Reject malformed package metadata before it can become a scoped ownership declaration. */
function parseCiImpactConfiguration(value: unknown): CiImpactConfiguration | undefined {
  if (
    typeof value !== 'object' ||
    value === null ||
    !Array.isArray((value as { suites?: unknown }).suites)
  ) {
    return undefined;
  }
  const { suites } = value as { readonly suites: readonly unknown[] };
  if (!suites.every(isCiImpactSuite)) return undefined;
  const { complete } = value as { readonly complete?: unknown };
  return {
    complete: typeof complete === 'object' && complete !== null ? complete : undefined,
    suites,
  };
}

/*** Validate untrusted JSON suite data before constructing the typed configuration. */
function isCiImpactSuite(value: unknown): value is CiImpactSuite {
  if (typeof value !== 'object' || value === null) return false;
  const suite = value as {
    readonly kind?: unknown;
    readonly script?: unknown;
    readonly paths?: unknown;
  };
  return (
    (suite.kind === 'e2e' || suite.kind === 'smoke') &&
    typeof suite.script === 'string' &&
    Array.isArray(suite.paths) &&
    suite.paths.every((path) => typeof path === 'string')
  );
}

/*** Execute an already saved CI plan without shell interpolation. */
function runPlan(plan: CiImpactPlan, kind: 'unit' | CiImpactKind, cwd: string): void {
  const selection = plan[kind];
  if (selection.mode === 'skip') return;
  if (kind === 'unit' && selection.mode === 'changed') {
    execFileSync('bun', ['test', '--changed=' + plan.base], { cwd, stdio: 'inherit' });
    return;
  }
  for (const script of selection.scripts) {
    execFileSync('bun', ['run', script], { cwd, stdio: 'inherit' });
  }
}

/*** Restrict the public command to known operations before it reads or executes repository state. */
function parseOperation(argv: readonly string[]): CiImpactOperation {
  if (argv.length !== 1 || !['plan', 'unit', 'e2e', 'smoke'].includes(argv[0] ?? '')) {
    throw new Error('Expected exactly one operation: plan, unit, e2e, or smoke.');
  }
  return argv[0] as CiImpactOperation;
}
