import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { artifactReleaseDescriptor } from './createArtifactReleaseLifecycleFixtureAsync.test.js';

/*** Install a packed Devtools artifact and generate the consumer workflow through its public CLI. */
export async function createPackedArtifactConsumerAsync(): Promise<{
  readonly consumer: string;
  readonly directory: string;
}> {
  const directory = await mkdtemp('/tmp/devtools-artifact-packed-consumer-');
  const consumer = join(directory, 'consumer');
  execFileSync('bun', ['run', 'build'], { cwd: process.cwd(), encoding: 'utf8' });
  execFileSync('bun', ['pm', 'pack', '--destination', directory], {
    cwd: process.cwd(),
    encoding: 'utf8',
  });
  const archiveName = (await readdir(directory)).find((name) => name.endsWith('.tgz'));
  if (archiveName === undefined)
    throw new Error('Expected Bun to create a Devtools package tarball.');
  await mkdir(join(consumer, '.ankh'), { recursive: true });
  await writeFile(join(consumer, '.ankh/release-distribution.json'), artifactReleaseDescriptor());
  await writeFile(
    join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'packed-artifact-consumer', private: true, version: '0.0.0' })}\n`,
  );
  installArchive(consumer, join(directory, archiveName), directory);
  synchronizeWorkflow(consumer);
  return { consumer, directory };
}

/*** Install the exact packed archive in an isolated consumer without lifecycle scripts. */
function installArchive(consumer: string, archive: string, directory: string): void {
  execFileSync('npm', ['install', '--ignore-scripts', '--no-save', archive], {
    cwd: consumer,
    encoding: 'utf8',
    env: { ...process.env, npm_config_cache: join(directory, 'npm-cache') },
  });
}

/*** Invoke only the installed public CLI to create managed consumer files. */
function synchronizeWorkflow(consumer: string): void {
  execFileSync(
    'node',
    [
      join(consumer, 'node_modules/@ankhorage/devtools/dist/cli/bin/repository.js'),
      'workflows',
      'sync',
      '.',
    ],
    { cwd: consumer, encoding: 'utf8' },
  );
}
