import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/*** Create a packed package whose root either is or is not isolated from an optional dependency. */
export async function createPackedOptionalDependencyFixtureAsync(unsafe: boolean): Promise<{
  readonly artifact: string;
  readonly directory: string;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'devtools-optional-dependency-'));
  const packageDirectory = join(directory, 'package');
  await mkdir(packageDirectory);
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify({
      exports: { '.': './index.js' },
      name: '@example/optional-boundary',
      optionalDependencies: { '@example/optional-sdk': '1.0.0' },
      type: 'module',
      version: '1.0.0',
    })}\n`,
  );
  await writeFile(
    join(packageDirectory, 'index.js'),
    unsafe
      ? "import '@example/optional-sdk';\nexport const value = 'unsafe';\n"
      : "export const value = 'safe';\n",
  );
  const packing = Bun.spawn(['bun', 'pm', 'pack', '--destination', directory], {
    cwd: packageDirectory,
    stderr: 'pipe',
    stdout: 'pipe',
  });
  await requireSuccessfulBunCommandAsync(packing);
  const artifact = (await readdir(directory)).find((entry) => entry.endsWith('.tgz'));
  if (artifact === undefined) throw new Error('Expected an optional-dependency fixture artifact.');
  return { artifact: join(directory, artifact), directory };
}

/*** Install a packed fixture without optional dependencies and load its root export. */
export async function importPackedRootWithoutOptionalDependenciesAsync(fixture: {
  readonly artifact: string;
  readonly directory: string;
}): Promise<number> {
  const consumerDirectory = join(fixture.directory, 'consumer');
  await mkdir(consumerDirectory);
  await writeFile(
    join(consumerDirectory, 'package.json'),
    '{"name":"optional-consumer","private":true,"version":"1.0.0"}\n',
  );
  const temporaryDirectory = join(fixture.directory, 'tmp');
  const cacheDirectory = join(fixture.directory, 'cache');
  await Promise.all([mkdir(temporaryDirectory), mkdir(cacheDirectory)]);
  const installation = Bun.spawn(
    ['bun', 'add', fixture.artifact, '--ignore-scripts', '--omit', 'optional'],
    {
      cwd: consumerDirectory,
      env: { ...process.env, BUN_INSTALL_CACHE_DIR: cacheDirectory, TMPDIR: temporaryDirectory },
      stderr: 'pipe',
      stdout: 'pipe',
    },
  );
  await requireSuccessfulBunCommandAsync(installation);
  return Bun.spawn(['bun', '-e', "await import('@example/optional-boundary')"], {
    cwd: consumerDirectory,
    stderr: 'pipe',
    stdout: 'pipe',
  }).exited;
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
