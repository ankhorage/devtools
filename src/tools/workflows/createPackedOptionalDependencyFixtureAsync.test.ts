import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

type RuntimeSafety = 'safe' | 'unsafe';

interface PackedOptionalDependencyFixtureInput {
  readonly import?: RuntimeSafety | 'missing';
  readonly isolatedProviderSubpath?: boolean;
  readonly mandatoryDependency?: boolean;
  readonly platformOnly?: boolean;
  readonly require?: RuntimeSafety;
}

/*** Create a packed package with independently controlled root runtime conditions. */
export async function createPackedOptionalDependencyFixtureAsync(
  input: PackedOptionalDependencyFixtureInput,
): Promise<{
  readonly artifact: string;
  readonly directory: string;
  readonly packageName: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'devtools-optional-dependency-'));
  const packageDirectory = join(directory, 'package');
  const packageName = '@example/optional-boundary';
  await mkdir(packageDirectory);
  await writeRuntimeSourcesAsync(packageDirectory, input);
  if (input.isolatedProviderSubpath) {
    await writeFile(
      join(packageDirectory, 'provider.js'),
      "export const loadOptionalProvider = async () => await import('@example/optional-sdk');\n",
    );
  }
  const dependencies = input.mandatoryDependency
    ? { 'is-number': await readInstalledIsNumberVersionAsync() }
    : undefined;
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify({
      dependencies,
      exports: createExports(input),
      name: packageName,
      optionalDependencies: { '@example/optional-sdk': '1.0.0' },
      type: 'module',
      version: '1.0.0',
    })}\n`,
  );
  const packing = Bun.spawn(['bun', 'pm', 'pack', '--destination', directory], {
    cwd: packageDirectory,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  await requireSuccessfulBunCommandAsync(packing);
  const artifact = (await readdir(directory)).find((entry) => entry.endsWith('.tgz'));
  if (artifact === undefined) throw new Error('Expected an optional-dependency fixture artifact.');
  return { artifact: join(directory, artifact), directory, packageName };
}

/*** Write the independently selected ESM and CommonJS fixture runtime sources. */
async function writeRuntimeSourcesAsync(
  packageDirectory: string,
  input: PackedOptionalDependencyFixtureInput,
): Promise<void> {
  await Promise.all([
    writeFile(
      join(packageDirectory, 'esm.js'),
      sourceForRuntime(input.import, 'esm', input.mandatoryDependency),
    ),
    writeFile(
      join(packageDirectory, 'cjs.cjs'),
      sourceForRuntime(input.require, 'cjs', input.mandatoryDependency),
    ),
  ]);
}

/*** Read the lockfile-owned version used for the mandatory-dependency fixture. */
async function readInstalledIsNumberVersionAsync(): Promise<string> {
  const manifest = JSON.parse(
    await readFile(join(process.cwd(), 'node_modules', 'is-number', 'package.json'), 'utf8'),
  ) as { readonly version?: unknown };
  if (typeof manifest.version !== 'string') {
    throw new Error('The mandatory fixture dependency must have an installed version.');
  }
  return manifest.version;
}

/*** Create the public export map used by a packed optional-dependency fixture. */
function createExports(input: PackedOptionalDependencyFixtureInput): Record<string, unknown> {
  if (input.platformOnly) {
    return {
      '.': {
        browser: './esm.js',
        'react-native': './esm.js',
      },
    };
  }
  return {
    '.': {
      ...(input.import === undefined
        ? {}
        : { import: input.import === 'missing' ? './missing.js' : './esm.js' }),
      ...(input.require === undefined ? {} : { require: './cjs.cjs' }),
    },
    ...(input.isolatedProviderSubpath ? { './provider': './provider.js' } : {}),
  };
}

/*** Write the source used by one ESM or CommonJS root condition. */
function sourceForRuntime(
  runtime: RuntimeSafety | 'missing' | undefined,
  moduleKind: 'cjs' | 'esm',
  mandatoryDependency: boolean | undefined,
): string {
  if (runtime === 'missing') return "export const missing = 'missing';\n";
  if (runtime === 'unsafe') {
    return moduleKind === 'esm'
      ? "import '@example/optional-sdk';\nexport const value = 'unsafe';\n"
      : "require('@example/optional-sdk');\nexports.value = 'unsafe';\n";
  }
  if (mandatoryDependency) {
    return moduleKind === 'esm'
      ? "import 'is-number';\nexport const value = 'safe';\n"
      : "require('is-number');\nexports.value = 'safe';\n";
  }
  return moduleKind === 'esm' ? "export const value = 'safe';\n" : "exports.value = 'safe';\n";
}

/*** Surface a packed-fixture command failure with its actual stderr. */
async function requireSuccessfulBunCommandAsync(
  command: ReturnType<typeof Bun.spawn>,
): Promise<void> {
  const [exitCode, stderr] = await Promise.all([
    command.exited,
    new Response(typeof command.stderr === 'number' ? undefined : command.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr);
}
