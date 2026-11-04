import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

type Kind = 'e2e' | 'smoke';
type Mode = 'skip' | 'full' | 'changed' | 'scoped';
interface Selection {
  readonly mode: Mode;
  readonly scripts: readonly string[];
  readonly reason: string;
}
interface Plan {
  readonly base: string;
  readonly unit: Selection;
  readonly e2e: Selection;
  readonly smoke: Selection;
}
interface Scope {
  readonly kind: Kind;
  readonly script: string;
  readonly paths: readonly string[];
}
interface Configuration {
  readonly complete?: Partial<Record<Kind, boolean>>;
  readonly suites?: readonly Scope[];
}

/*** Select safe CI checks, using explicit suite ownership and Bun's dependency graph. */
export function planCiImpact(
  files: readonly string[] | null,
  scripts: Readonly<Record<string, string>>,
  configuration: Configuration | undefined,
  base: string,
): Plan {
  const full = files === null || files.some(isUnsafeChange);
  const docs = files !== null && files.every(isDocumentation);
  const baseSelection: Selection = {
    mode: full ? 'full' : 'skip',
    scripts: [],
    reason: full ? 'Unsafe or unavailable diff' : 'Documentation only',
  };
  const unit: Selection =
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

/*** Select scoped suites only when an exhaustive repository declaration is valid. */
function selectSuites(
  kind: Kind,
  files: readonly string[] | null,
  scripts: Readonly<Record<string, string>>,
  configuration: Configuration | undefined,
  full: boolean,
  docs: boolean,
): Selection {
  const defaults = (kind === 'e2e' ? ['test:e2e'] : ['test:smoke', 'test:standalone']).filter(
    (name) => scripts[name] !== undefined,
  );
  const suites = configuration?.suites?.filter((suite) => suite.kind === kind) ?? [];
  const validSuites =
    suites.length > 0 &&
    suites.every(
      (suite) =>
        typeof scripts[suite.script] === 'string' &&
        suite.paths.length > 0 &&
        suite.paths.every((path) => typeof path === 'string' && isSafePattern(path)),
    );
  const fallbackScripts =
    defaults.length > 0
      ? defaults
      : suites.map((suite) => suite.script).filter((script) => scripts[script] !== undefined);

  if (fallbackScripts.length === 0)
    return { mode: 'skip', scripts: [], reason: 'No suite scripts' };
  if (docs) return { mode: 'skip', scripts: [], reason: 'Documentation only' };
  if (full || files === null)
    return { mode: 'full', scripts: fallbackScripts, reason: 'Unsafe or unavailable diff' };
  if (configuration?.complete?.[kind] !== true || !validSuites) {
    return { mode: 'full', scripts: fallbackScripts, reason: 'No complete suite mapping' };
  }
  const matches = files.map((file) =>
    suites.filter((suite) => suite.paths.some((pattern) => matchesPath(file, pattern))),
  );
  if (matches.some((found) => found.length === 0)) {
    return { mode: 'full', scripts: fallbackScripts, reason: 'Unmapped changed file' };
  }
  const selected = [...new Set(matches.flat().map((suite) => suite.script))];
  return { mode: 'scoped', scripts: selected, reason: 'Explicit complete suite mapping' };
}

/*** Conservatively identify changes that invalidate impact pruning. */
function isUnsafeChange(file: string): boolean {
  return (
    /^(?:\.github\/|\.agents\/|scripts\/|test\/|tests\/|config\/)/u.test(file) ||
    /^(?:package\.json|bun\.lock|bunfig\.toml|AGENTS\.md|tsconfig[^/]*|playwright\.config\.[^/]+|vitest\.config\.[^/]+|jest\.config\.[^/]+|eslint\.config\.[^/]+|\.env[^/]*)$/u.test(
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

/*** Read Git's binary-safe status output, failing closed for removals and invalid refs. */
function readChangedFiles(base: string): readonly string[] | null {
  if (!/^[a-f0-9]{40}$/u.test(base)) return null;
  try {
    execFileSync('git', ['cat-file', '-e', base + '^{commit}'], { stdio: 'ignore' });
    const output = execFileSync(
      'git',
      ['diff', '--name-status', '--no-renames', '-z', base, 'HEAD', '--'],
      { encoding: 'utf8' },
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
function createPlan(): Plan {
  const manifest = JSON.parse(readFileSync('package.json', 'utf8')) as {
    scripts?: Record<string, string>;
    ankh?: { ciImpact?: Configuration };
  };
  const base =
    process.env.GITHUB_EVENT_NAME === 'pull_request' ? (process.env.ANKH_CI_BASE_SHA ?? '') : '';
  const files = base ? readChangedFiles(base) : null;
  return planCiImpact(files, manifest.scripts ?? {}, manifest.ankh?.ciImpact, base);
}

/*** Execute an already saved CI plan without shell interpolation. */
function runPlan(plan: Plan, kind: 'unit' | Kind): void {
  const selection = plan[kind];
  if (selection.mode === 'skip') return;
  if (kind === 'unit' && selection.mode === 'changed') {
    execFileSync('bun', ['test', '--changed=' + plan.base], { stdio: 'inherit' });
    return;
  }
  for (const script of selection.scripts) {
    execFileSync('bun', ['run', script], { stdio: 'inherit' });
  }
}

/*** Expose test decisions in GitHub outputs and a human-readable step summary. */
function main(): void {
  const operation = process.argv[2];
  const planPath = join(process.env.RUNNER_TEMP ?? '.', 'ankh-ci-impact-plan.json');
  if (operation === 'plan') {
    const plan = createPlan();
    writeFileSync(planPath, JSON.stringify(plan));
    if (process.env.GITHUB_OUTPUT) {
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        ['unit=' + plan.unit.mode, 'e2e=' + plan.e2e.mode, 'smoke=' + plan.smoke.mode].join('\n') +
          '\n',
      );
    }
    console.log(JSON.stringify(plan, null, 2));
    if (process.env.GITHUB_STEP_SUMMARY) {
      appendFileSync(
        process.env.GITHUB_STEP_SUMMARY,
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
    return;
  }
  if (operation !== 'unit' && operation !== 'e2e' && operation !== 'smoke') {
    throw new Error('Expected plan, unit, e2e, or smoke');
  }
  const plan = JSON.parse(readFileSync(planPath, 'utf8')) as Plan;
  runPlan(plan, operation);
}

if (import.meta.main) main();
