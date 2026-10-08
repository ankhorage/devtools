import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('managed release verifies the exact npm artifact before finalization', async () => {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }

  const release = await releaseDefinition.render('.');
  expectReleaseOrdering(release);
  expectPackedRuntimeVerification(release);
  expectPublishedArtifactVerification(release);
});

/*** Assert release ordering and exact release-commit finalization. */
function expectReleaseOrdering(release: string): void {
  const publishIndex = release.indexOf('      - name: Publish unpublished packages');
  const verificationJobIndex = release.indexOf('  verify-publication:');
  const finalizationJobIndex = release.indexOf('  finalize:');

  expect(verificationJobIndex).toBeGreaterThan(publishIndex);
  expect(finalizationJobIndex).toBeGreaterThan(verificationJobIndex);
  expect(release).toContain('needs: release');
  expect(release).toContain("if: needs.release.outputs.versioned == 'true'");
  expect(release).toContain("needs.verify-publication.result == 'success'");
  expect(release).toContain('ref: ${{ needs.release.outputs.release_sha }}');
  expect(release).toContain('release_sha: ${{ steps.release.outputs.release_sha }}');
  expect(release).toContain('echo "release_sha=$(git rev-parse HEAD)" >> "$GITHUB_OUTPUT"');
  expect(release).toContain('git tag "$tag" "$RELEASE_SHA"');
  expectRepositoryCapabilityMaterialization(release);
  expect(release).toContain(
    'gh release create "$tag" --repo "$GITHUB_REPOSITORY" --generate-notes --target "$RELEASE_SHA"',
  );
}

/*** Assert release materialization uses Bun without assuming Devtools installs itself. */
function expectRepositoryCapabilityMaterialization(release: string): void {
  expect(release).toContain('Synchronize package capability metadata');
  expect(release)
    .toContain(`if node -e "const p=require('./package.json'); process.exit(p.name === '@ankhorage/devtools' ? 0 : 1)"; then
              bun ./dist/cli/bin/repository.js package sync .
              bun ./dist/cli/bin/repository.js package status .
            else
              bunx --bun --no-install ankhorage-repository package sync .
              bunx --bun --no-install ankhorage-repository package status .
            fi`);
}

/*** Assert the clean packed consumer loads every declared runtime boundary before publication. */
function expectPackedRuntimeVerification(release: string): void {
  expect(release).toContain('Verify standalone packed install');
  expect(release).toContain('npm pack --ignore-scripts --pack-destination "$pack_dir"');
  expect(release).toContain(
    'PACKAGE_NAME="$package_name" node - <<\'NODE\' > runtime-entrypoints.txt',
  );
  expect(release).toContain(
    "const importConditions = new Set(['bun', 'default', 'import', 'node']);",
  );
  expect(release).toContain("const requireConditions = new Set(['default', 'node', 'require']);");
  expect(release).toContain("const platformConditions = new Set(['browser', 'react-native']);");
  expect(release).toContain("const explicitServerConditions = new Set(['bun', 'node']);");
  expect(release).toContain('const isPlatformOnlyRuntimeTarget = (target) =>');
  expect(release).toContain('if (isPlatformOnlyRuntimeTarget(target)) return undefined;');
  expect(release).toContain("if (supportsLoader(target, importConditions)) return 'import';");
  expect(release).toContain("if (supportsLoader(target, requireConditions)) return 'require';");
  expect(release).toContain('if (exportsMap === undefined)');
  expect(release).toContain("!Object.keys(exportsMap).some((key) => key.startsWith('.'))");
  expect(release).toContain('records.push(`${loader}|${specifier}`);');
  expect(release).toContain(
    "process.stdout.write(output.length === 0 ? '' : `${output.join('\\n')}\\n`);",
  );
  expect(release).toContain("while IFS='|' read -r loader specifier; do");
  expect(release).toContain(
    'Packed package.json ankh.capabilities must exactly match the public CAPABILITIES catalog.',
  );
  expect(release).toContain('PACKAGE_NAME="$package_name" node --input-type=module - <<\'NODE\'');
  expect(release).toContain("import { createRequire } from 'node:module';");
  expect(release).not.toContain("const { createRequire } = require('node:module');");
  expect(release).toContain("!Object.hasOwn(manifest.ankh, 'capabilities')");
  expect(release).toContain('await import(`${name}/capabilities`)');
  expect(release).toContain("requireFromPackage.resolve('@ankhorage/contracts/capabilities')");
  expect(release).toContain(
    'PACKAGE_SPECIFIER="$specifier" bun -e \'await import(process.env.PACKAGE_SPECIFIER)\'',
  );
  expect(release).toContain(
    'PACKAGE_SPECIFIER="$specifier" node -e \'require(process.env.PACKAGE_SPECIFIER)\'',
  );
  expect(release).toContain('PACKAGE_NAME="$package_name" node - <<\'NODE\' > binary-paths.txt');
  expect(release).toContain(
    "process.stdout.write(paths.length === 0 ? '' : `${paths.join('\\n')}\\n`);",
  );
  expect(release).toContain('bun build "$binary_path" --target=bun --outdir "$binary_build_dir"');
  expect(release).toContain('timeout 5s bun "$binary_path"');
  expect(release).toContain('Packed binary runtime dependency missing');
  expect(release).not.toContain('pathToFileURL(process.env.BINARY_PATH)');
  expect(release).not.toContain('--help');
}

test('packed capability parity probe runs as ESM and rejects catalog drift', async () => {
  const release = await renderReleaseWorkflowAsync();
  const probe = extractCapabilityParityProbe(release);
  const matchingFixture = await createPackedCapabilityFixture(false);
  const matchingResult = await runCapabilityParityProbeAsync(matchingFixture, probe);

  expect(matchingResult.exitCode).toBe(0);
  expect(matchingResult.stderr).not.toContain('ERR_AMBIGUOUS_MODULE_SYNTAX');

  const driftedFixture = await createPackedCapabilityFixture(true);
  const driftedResult = await runCapabilityParityProbeAsync(driftedFixture, probe);

  expect(driftedResult.exitCode).not.toBe(0);
  expect(driftedResult.stderr).toContain(
    'Packed package.json ankh.capabilities must exactly match the public CAPABILITIES catalog.',
  );
  expect(driftedResult.stderr).not.toContain('ERR_AMBIGUOUS_MODULE_SYNTAX');
});

/*** Render the managed release workflow used as the executable probe source. */
async function renderReleaseWorkflowAsync(): Promise<string> {
  const releaseDefinition = workflowManagedFiles.find(
    ({ relativePath }) => relativePath === '.github/workflows/release.yml',
  );
  if (releaseDefinition?.render === undefined) {
    throw new Error('Missing managed release workflow renderer.');
  }
  return releaseDefinition.render('.');
}

/*** Extract the ESM capability-parity heredoc from the rendered release workflow. */
function extractCapabilityParityProbe(release: string): string {
  const match =
    /PACKAGE_NAME="\$package_name" node --input-type=module - <<'NODE'\n(?<probe>[\s\S]*?)\n {10}NODE/u.exec(
      release,
    );
  if (match?.groups?.probe === undefined) {
    throw new Error('Missing packed capability parity probe.');
  }
  return match.groups.probe;
}

/*** Create an installed package fixture with package-scoped Contracts resolution. */
async function createPackedCapabilityFixture(drifted: boolean): Promise<string> {
  const directory = await mkdtemp('/tmp/devtools-release-parity-');
  temporaryDirectories.push(directory);
  const packageDirectory = join(directory, 'node_modules/@example/packed');
  const capability = {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    description: 'Exercise the packed parity probe.',
    id: 'example.packed.probe',
    label: 'Probe packed capability parity',
    owner: '@example/packed',
  };
  const metadata = drifted
    ? { ...capability, label: 'Drifted packed capability parity' }
    : capability;

  await mkdir(packageDirectory, { recursive: true });
  await mkdir(join(directory, 'node_modules/@ankhorage'), { recursive: true });
  await mkdir(join(directory, 'node_modules/@ankhorage/contracts'), { recursive: true });
  await writeFile(
    join(directory, 'node_modules/@ankhorage/contracts/package.json'),
    `${JSON.stringify({ exports: { './capabilities': './capabilities.js' }, type: 'module' })}\n`,
  );
  await writeFile(
    join(directory, 'node_modules/@ankhorage/contracts/capabilities.js'),
    `export const isCapability = (value) => typeof value === 'object' && value !== null;
export const normalizeCapability = (value) => value;
export const areCapabilitiesEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
`,
  );
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify(
      {
        ankh: { capabilities: [metadata] },
        exports: { './capabilities': './capabilities.js' },
        name: '@example/packed',
        type: 'module',
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(packageDirectory, 'capabilities.js'),
    `export const CAPABILITIES = ${JSON.stringify([capability])};\n`,
  );
  return directory;
}

/*** Run the rendered ESM probe exactly as the packed-install workflow does. */
async function runCapabilityParityProbeAsync(
  directory: string,
  probe: string,
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  const subprocess = Bun.spawn(['node', '--input-type=module', '-'], {
    cwd: directory,
    env: { ...process.env, PACKAGE_NAME: '@example/packed' },
    stderr: 'pipe',
    stdin: new TextEncoder().encode(probe),
    stdout: 'pipe',
  });
  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ]);
  return { exitCode, stderr };
}

/*** Assert the public npm artifact is independently retrievable before finalization. */
function expectPublishedArtifactVerification(release: string): void {
  expect(release).toContain('npm view "$package_spec" version dist.tarball dist.integrity --json');
  expect(release).toContain('Array.isArray(raw)&&raw.length===1?raw[0]:raw');
  expect(release).toContain('curl --fail --location --silent --show-error --output "$artifact"');
  expect(release).toContain("const actual='sha512-'");
  expect(release).toContain('npm pack "$package_spec" --pack-destination "$attempt_pack_dir"');
  expect(release).toContain('max_attempts=60');
  expect(release).toContain('retry_seconds=30');
  expect(release).toContain('last_stage="registry-metadata"');
  expect(release).toContain('last_stage="tarball-download"');
  expect(release).toContain('last_stage="integrity"');
  expect(release).toContain('last_stage="npm-pack"');
  expect(release).toContain('Published npm artifact not ready at stage: ${last_stage}.');
  expect(release).toContain('attempt_pack_dir="$pack_dir/attempt-${attempt}"');
  expect(release).toContain('Verify published npm artifact from a fresh runner');
}

test('packed runtime loader selection distinguishes platform-only and server-capable exports', () => {
  expect(selectPackedRuntimeLoader({ import: './dist/index.js' })).toBe('import');
  expect(
    selectPackedRuntimeLoader({
      'react-native': './src/index.ts',
      browser: './src/index.ts',
      import: './dist/index.js',
      default: './dist/index.js',
    }),
  ).toBeUndefined();
  expect(
    selectPackedRuntimeLoader({
      browser: './dist/browser.js',
      node: './dist/node.js',
      import: './dist/index.js',
    }),
  ).toBe('import');
});

/*** Mirror the managed workflow's environment-aware packed runtime loader decision. */
function selectPackedRuntimeLoader(target: unknown): 'import' | 'require' | undefined {
  const importConditions = new Set(['bun', 'default', 'import', 'node']);
  const requireConditions = new Set(['default', 'node', 'require']);
  const platformConditions = new Set(['browser', 'react-native']);
  const explicitServerConditions = new Set(['bun', 'node']);
  const supportsLoader = (value: unknown, conditions: ReadonlySet<string>): boolean => {
    if (typeof value === 'string') return true;
    if (Array.isArray(value)) return value.some((entry) => supportsLoader(entry, conditions));
    if (!isConditionMap(value)) return false;
    return Object.entries(value).some(
      ([condition, entry]) => conditions.has(condition) && supportsLoader(entry, conditions),
    );
  };
  const declaresCondition = (value: unknown, conditions: ReadonlySet<string>): boolean => {
    if (Array.isArray(value)) return value.some((entry) => declaresCondition(entry, conditions));
    if (!isConditionMap(value)) return false;
    return Object.entries(value).some(
      ([condition, entry]) => conditions.has(condition) || declaresCondition(entry, conditions),
    );
  };

  if (
    declaresCondition(target, platformConditions) &&
    !declaresCondition(target, explicitServerConditions)
  ) {
    return undefined;
  }
  if (supportsLoader(target, importConditions)) return 'import';
  if (supportsLoader(target, requireConditions)) return 'require';
  return undefined;
}

/*** Narrow conditional export maps used by the workflow contract fixture. */
function isConditionMap(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
