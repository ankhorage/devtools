import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

/*** Create a frozen consumer with the packed Devtools artifact that owns repository synchronization. */
export async function createPackedDevtoolsConsumerAsync(
  tag: 'correct' | 'missing' | 'wrong',
): Promise<{
  readonly directories: readonly string[];
  readonly directory: string;
  readonly outputPath: string;
  readonly releaseSha: string;
}> {
  const packageDirectory = await mkdtemp('/tmp/devtools-release-packed-artifact-');
  const directory = await mkdtemp('/tmp/devtools-release-packed-consumer-');
  const outputDirectory = await mkdtemp('/tmp/devtools-release-packed-output-');

  runBunCommand(process.cwd(), ['pm', 'pack', '--destination', packageDirectory]);
  const archive = (await readdir(packageDirectory)).find((entry) => entry.endsWith('.tgz'));
  if (archive === undefined) throw new Error('Expected the packed Devtools consumer archive.');

  await mkdir(join(directory, '.changeset'), { recursive: true });
  await writeFile(join(directory, '.changeset', 'config.json'), '{}\n');
  await writeFile(join(directory, '.changeset', 'README.md'), '# Changesets\n');
  await writeFile(join(directory, '.gitignore'), 'node_modules\n');
  await writeFile(
    join(directory, 'package.json'),
    `${JSON.stringify({
      ankh: {},
      devDependencies: { '@ankhorage/devtools': `file:${join(packageDirectory, archive)}` },
      name: '@ankhorage/rules',
      private: true,
      version: '1.0.0',
    })}\n`,
  );
  runBunCommand(directory, ['install']);
  runBunCommand(directory, ['install', '--frozen-lockfile']);
  runGit(directory, ['init', '--initial-branch=main']);
  runGit(directory, ['config', 'user.name', 'fixture']);
  runGit(directory, ['config', 'user.email', 'fixture@example.test']);
  runGit(directory, ['add', '.']);
  runGit(directory, ['commit', '-m', 'chore(release): version packages [skip ci]']);
  const releaseSha = runGit(directory, ['rev-parse', 'HEAD']).trim();
  if (tag === 'correct') runGit(directory, ['tag', 'v1.0.0', releaseSha]);
  await writeFile(join(directory, 'workflow-update'), 'current main\n');
  runGit(directory, ['add', 'workflow-update']);
  runGit(directory, ['commit', '-m', 'chore: update managed workflow']);
  if (tag === 'wrong') runGit(directory, ['tag', 'v1.0.0']);

  return {
    directories: [packageDirectory, directory, outputDirectory],
    directory,
    outputPath: join(outputDirectory, 'github-output'),
    releaseSha,
  };
}

/*** Run a Bun command for the packed consumer fixture and surface the real CLI failure. */
function runBunCommand(directory: string, args: readonly string[]): void {
  execFileSync('bun', args, { cwd: directory, encoding: 'utf8', stdio: 'pipe' });
}

/*** Run a Git command while constructing the canonical release history fixture. */
function runGit(directory: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: directory, encoding: 'utf8' });
}
