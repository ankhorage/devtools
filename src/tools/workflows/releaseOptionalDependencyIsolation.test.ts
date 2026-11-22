import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { createPackedOptionalDependencyFixtureAsync } from './createPackedOptionalDependencyFixtureAsync.test.js';
import { workflowManagedFiles } from './index.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

test('managed release verifies packed roots without optional dependencies in their required runtime', async () => {
  const release = await renderReleaseWorkflowAsync();
  expect(release).toContain('bun add "$artifact" --ignore-scripts --omit optional');
  expect(release).toContain(
    'root_runtime_entrypoints="$(awk -F \'|\' -v package_name="$package_name" \'$2 == package_name { print }\' runtime-entrypoints.txt)"',
  );

  await expectPackedRootIsolationResultAsync({ import: 'safe', require: 'safe' }, 0);
  await expectPackedRootIsolationResultAsync(
    {
      defaultImport: true,
      import: 'safe',
      topLevelAwaitImport: true,
    },
    0,
  );
  await expectPackedRootIsolationFailureAsync({ import: 'unsafe', require: 'safe' });
  await expectPackedRootIsolationFailureAsync({ import: 'safe', require: 'unsafe' });
  await expectPackedRootIsolationFailureAsync({ import: 'missing' });
  await expectPackedRootIsolationResultAsync({ import: 'safe', isolatedProviderSubpath: true }, 0);
  await expectPackedRootIsolationResultAsync({ import: 'safe', mandatoryDependency: true }, 0);
  await expectPackedRootIsolationResultAsync({ platformOnly: true }, 0);
  await expectPackedRootIsolationResultAsync({ import: 'safe', reactNativeFlowImport: true }, 0);
}, 30_000);

/*** Assert that the rendered packed-root isolation probe has the expected exit code. */
async function expectPackedRootIsolationResultAsync(
  input: Parameters<typeof createPackedOptionalDependencyFixtureAsync>[0],
  expectedExitCode: number,
): Promise<void> {
  const result = await runPackedRootIsolationWorkflowAsync(
    await createOptionalDependencyFixtureAsync(input),
  );
  if (result.exitCode !== expectedExitCode) throw new Error(result.stderr);
  expect(result.exitCode).toBe(expectedExitCode);
}

/*** Assert that an unsafe root condition makes the rendered isolation probe fail. */
async function expectPackedRootIsolationFailureAsync(
  input: Parameters<typeof createPackedOptionalDependencyFixtureAsync>[0],
): Promise<void> {
  const result = await runPackedRootIsolationWorkflowAsync(
    await createOptionalDependencyFixtureAsync(input),
  );
  expect(result.exitCode).not.toBe(0);
}

/*** Create and register a packed optional-dependency fixture for automatic cleanup. */
async function createOptionalDependencyFixtureAsync(
  input: Parameters<typeof createPackedOptionalDependencyFixtureAsync>[0],
): ReturnType<typeof createPackedOptionalDependencyFixtureAsync> {
  const fixture = await createPackedOptionalDependencyFixtureAsync(input);
  temporaryDirectories.push(fixture.directory);
  return fixture;
}

/*** Execute the rendered packed-root discovery and optional-isolation probe without altering it. */
async function runPackedRootIsolationWorkflowAsync(fixture: {
  readonly artifact: string;
  readonly packageName: string;
  readonly reactNativeFlowImport: boolean;
  readonly reactNativePlatformOnly: boolean;
}): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  const consumer = await createPackedRootConsumerAsync();
  const installation = Bun.spawn(
    ['bun', 'add', fixture.artifact, '--ignore-scripts', '--omit', 'optional'],
    { cwd: consumer.directory, env: consumer.environment, stderr: 'pipe', stdout: 'pipe' },
  );
  if ((await installation.exited) !== 0) {
    return { exitCode: 1, stderr: await new Response(installation.stderr).text() };
  }
  if (fixture.reactNativeFlowImport || fixture.reactNativePlatformOnly) {
    await installReactNativeFlowFixtureAsync(consumer.optionalInstallDirectory);
  }
  return executeRenderedRootIsolationAsync(fixture, consumer);
}

/*** Create the isolated consumer and cache used by the rendered root probe. */
async function createPackedRootConsumerAsync(): Promise<{
  readonly directory: string;
  readonly environment: Record<string, string | undefined>;
  readonly optionalInstallDirectory: string;
  readonly platformToolchainDependencies: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'devtools-packed-root-consumer-'));
  const cacheDirectory = join(directory, 'cache');
  const temporaryDirectory = join(directory, 'tmp');
  const optionalInstallDirectory = join(directory, 'optional');
  const toolchainDirectory = join(directory, 'toolchain');
  temporaryDirectories.push(directory);
  await Promise.all([
    mkdir(cacheDirectory),
    mkdir(optionalInstallDirectory),
    mkdir(temporaryDirectory),
    mkdir(toolchainDirectory),
    writeFile(
      join(directory, 'package.json'),
      '{"name":"packed-root-consumer","private":true,"version":"0.0.0"}\n',
    ),
  ]);
  return {
    directory,
    environment: {
      ...process.env,
      BUN_INSTALL_CACHE_DIR: cacheDirectory,
      RUNNER_TEMP: temporaryDirectory,
      TMPDIR: temporaryDirectory,
    },
    optionalInstallDirectory,
    platformToolchainDependencies: await createExpoToolchainAsync(toolchainDirectory),
  };
}

/*** Create a local declared Expo toolchain so the rendered platform probe stays offline. */
async function createExpoToolchainAsync(directory: string): Promise<string> {
  const packages = ['expo', 'react', 'react-native'] as const;
  await Promise.all(
    packages.map(async (name) => {
      const packageDirectory = join(directory, name);
      await mkdir(packageDirectory);
      await writeFile(
        join(packageDirectory, 'package.json'),
        JSON.stringify({
          bin: name === 'expo' ? { expo: './expo' } : undefined,
          name,
          version: '0.0.0',
        }),
      );
      if (name === 'expo') {
        const binary = join(packageDirectory, 'expo');
        await writeFile(binary, '#!/bin/sh\nexit 0\n');
        await chmod(binary, 0o755);
      }
    }),
  );
  return JSON.stringify(
    Object.fromEntries(packages.map((name) => [name, `file:${join(directory, name)}`])),
  );
}

/*** Run the exact rendered discovery and isolation source against an isolated packed consumer. */
async function executeRenderedRootIsolationAsync(
  fixture: { readonly artifact: string; readonly packageName: string },
  consumer: {
    readonly directory: string;
    readonly environment: Record<string, string | undefined>;
    readonly optionalInstallDirectory: string;
    readonly platformToolchainDependencies: string;
  },
): Promise<{ readonly exitCode: number; readonly stderr: string }> {
  const release = await renderReleaseWorkflowAsync();
  const script = `set -eu
PACKAGE_NAME="$package_name" node - <<'NODE' > runtime-entrypoints.txt
${extractPackedRuntimeEntrypointDiscovery(release)}
NODE
artifact="$artifact"
package_name="$package_name"
optional_install_dir="$optional_install_dir"
platform_toolchain_dependencies="$platform_toolchain_dependencies"
${extractPackedRootIsolationProbe(release)}`;
  const subprocess = Bun.spawn(['sh', '-c', script], {
    cwd: consumer.directory,
    env: {
      ...consumer.environment,
      artifact: fixture.artifact,
      optional_install_dir: consumer.optionalInstallDirectory,
      package_name: fixture.packageName,
      platform_toolchain_dependencies: consumer.platformToolchainDependencies,
    },
    stderr: 'pipe',
    stdout: 'pipe',
  });
  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ]);
  return { exitCode, stderr };
}

/*** Install a Studio-shaped React Native Flow boundary without an Expo executable. */
async function installReactNativeFlowFixtureAsync(optionalInstallDirectory: string): Promise<void> {
  const nodeModules = join(optionalInstallDirectory, 'node_modules');
  await mkdir(join(nodeModules, 'react-native'), { recursive: true });
  await Promise.all([
    writeFile(
      join(nodeModules, 'react-native', 'package.json'),
      '{"name":"react-native","type":"module","exports":"./index.js"}\n',
    ),
    writeFile(
      join(nodeModules, 'react-native', 'index.js'),
      "import typeof * as ReactNativePublicAPI from './index.js.flow';\nexport default ReactNativePublicAPI;\n",
    ),
    writeFile(join(nodeModules, 'react-native', 'index.js.flow'), 'export {};\n'),
  ]);
}

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

/*** Extract the exact rendered Node runtime-entrypoint discovery program. */
function extractPackedRuntimeEntrypointDiscovery(release: string): string {
  const match =
    /PACKAGE_NAME="\$package_name" node - <<'NODE' > runtime-entrypoints\.txt\n(?<probe>[\s\S]*?)\n {10}NODE/u.exec(
      release,
    );
  if (match?.groups?.probe === undefined) {
    throw new Error('Missing packed runtime-entrypoint discovery probe.');
  }
  return match.groups.probe;
}

/*** Extract the exact rendered root optional-dependency isolation shell probe. */
function extractPackedRootIsolationProbe(release: string): string {
  const start = release.indexOf('            verify_react_native_export()');
  const end = release.indexOf('\n\n            PACKAGE_NAME=', start);
  if (start === -1 || end === -1) {
    throw new Error('Missing packed root optional-dependency isolation probe.');
  }
  return release.slice(start, end).replaceAll(/^ {10}/gmu, '');
}
