import { mkdir, mkdtemp, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/*** Create an isolated packed consumer without a host or consumer Capability dependency. */
export async function createPackedCapabilityFixtureAsync({
  drifted,
  validator = 'available',
}: {
  readonly drifted: boolean;
  readonly validator?: 'available' | 'missing-capability' | 'missing-devtools';
}): Promise<{ readonly directory: string }> {
  const directory = await mkdtemp('/tmp/devtools-release-parity-');
  const sourceDirectory = join(directory, 'packed-source');
  await createPackedConsumerAsync(directory, sourceDirectory, drifted);
  await installPackedConsumerAsync(directory, sourceDirectory);
  if (validator !== 'missing-devtools') {
    await createDevtoolsValidatorAsync(directory, validator === 'available');
  }
  return { directory };
}

/*** Create a packed capability catalog source with matching or drifted package metadata. */
async function createPackedConsumerAsync(
  directory: string,
  sourceDirectory: string,
  drifted: boolean,
): Promise<void> {
  const packageDirectory = join(sourceDirectory, 'package');
  const capability = createCapability();
  const metadata = drifted
    ? { ...capability, label: 'Drifted packed capability parity' }
    : capability;
  await mkdir(packageDirectory, { recursive: true });
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify({ name: 'standalone-consumer', private: true, version: '0.0.0' })}\n`,
  );
  await writeFile(
    join(packageDirectory, 'package.json'),
    `${JSON.stringify(
      {
        ankh: { capabilities: [metadata] },
        exports: { './capabilities': './capabilities.js' },
        name: '@example/packed',
        type: 'module',
        version: '0.0.0',
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    join(packageDirectory, 'capabilities.js'),
    `export const CAPABILITIES = ${JSON.stringify([capability])};\n`,
  );
}

/*** Return the valid public catalog record used by the packed fixture. */
function createCapability(): Record<string, unknown> {
  return {
    access: ['invoke'],
    binding: { bindableAs: ['target'], kind: 'action' },
    description: 'Exercise the packed parity probe.',
    id: 'example.packed.probe',
    label: 'Probe packed capability parity',
    owner: '@example/packed',
  };
}

/*** Install the packed fixture without injecting any Capability dependency. */
async function installPackedConsumerAsync(
  directory: string,
  sourceDirectory: string,
): Promise<void> {
  const archive = join(sourceDirectory, 'example-packed-0.0.0.tgz');
  await runCommandAsync(
    ['tar', '-czf', archive, '-C', sourceDirectory, 'package'],
    sourceDirectory,
  );
  const packageScopeDirectory = join(directory, 'node_modules/@example');
  await mkdir(packageScopeDirectory, { recursive: true });
  await runCommandAsync(['tar', '-xzf', archive, '-C', packageScopeDirectory], directory);
  await rename(join(packageScopeDirectory, 'package'), join(packageScopeDirectory, 'packed'));
}

/*** Create a Devtools installation with an optional nested Capability validator dependency. */
async function createDevtoolsValidatorAsync(
  directory: string,
  includeCapability: boolean,
): Promise<void> {
  const devtoolsDirectory = join(directory, 'node_modules/@ankhorage/devtools');
  await mkdir(devtoolsDirectory, { recursive: true });
  await writeFile(
    join(devtoolsDirectory, 'package.json'),
    `${JSON.stringify({
      dependencies: { '@ankhorage/capability': '1.0.0' },
      exports: { './cli': { import: './cli.js' } },
      name: '@ankhorage/devtools',
    })}\n`,
  );
  await writeFile(join(devtoolsDirectory, 'cli.js'), 'module.exports = {};\n');
  if (!includeCapability) return;
  const validatorDirectory = join(devtoolsDirectory, 'node_modules/@ankhorage/capability');
  await mkdir(validatorDirectory, { recursive: true });
  await writeFile(
    join(validatorDirectory, 'package.json'),
    `${JSON.stringify({ exports: './index.js', type: 'module' })}\n`,
  );
  await writeFile(
    join(validatorDirectory, 'index.js'),
    `export const isCapability = (value) => typeof value === 'object' && value !== null;
export const normalizeCapability = (value) => value;
export const areCapabilitiesEqual = (left, right) => JSON.stringify(left) === JSON.stringify(right);
`,
  );
}

/*** Run a deterministic fixture setup command and surface its stderr on failure. */
async function runCommandAsync(command: readonly string[], cwd: string): Promise<void> {
  const subprocess = Bun.spawn([...command], { cwd, stderr: 'pipe', stdout: 'pipe' });
  const [exitCode, stderr] = await Promise.all([
    subprocess.exited,
    new Response(subprocess.stderr).text(),
  ]);
  if (exitCode !== 0) throw new Error(stderr);
}
