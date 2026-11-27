import { access, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { isRecord } from '@ankhorage/utility/object';

import {
  resolveManagedTargetDirectory,
  syncManagedFiles,
} from '../../features/managed-files/managedFiles.js';
import { bootstrapFiles } from '../../features/repository-bootstrap/bootstrapFiles.js';
import { initializeBootstrapChangesetsAsync } from '../../features/repository-bootstrap/initializeBootstrapChangesetsAsync.js';
import { planBootstrapManifest } from '../../features/repository-bootstrap/planBootstrapManifest.js';
import { runRepositoryMetadataCommandAsync } from '../../features/repository-metadata/application/runRepositoryMetadataCommandAsync.js';
import { assertToolchainVersions } from '../../tools/package/assertToolchainVersions.js';
import { readCurrentDevtoolsVersion } from '../../tools/package/index.js';
import { readPackageManifestAsync } from '../../tools/package/readPackageManifestAsync.js';
import type { DevtoolsRepositoryCommandContext } from '../../types/provider-command.js';
import { findDevtoolsCommandByPath } from '../commands.js';
import { runRepositoryCommand } from '../runRepositoryCommand.js';

/*** Initialize a standalone public TypeScript package using the managed synchronization owners. */
export async function init(
  argv: readonly string[],
  context: DevtoolsRepositoryCommandContext,
): Promise<{ readonly exitCode: number }> {
  try {
    const { target, dryRun, values } = await parseBootstrapArgumentsAsync(argv, context.cwd);
    const manifest = await readPackageManifestAsync(target);
    if (manifest === undefined) throw new Error('Supply an authored package.json.');
    assertToolchainVersions(manifest, readCurrentDevtoolsVersion());
    if (!(await fileExistsAsync(join(target, 'src/index.ts')))) {
      throw new Error('Supply the authored source entrypoint src/index.ts.');
    }
    const toolchain = await readBootstrapToolchainAsync();
    const planned = planBootstrapManifest(manifest, toolchain);
    const license = await readLicenseInputsAsync(
      target,
      values['license-file'],
      values['copyright-owner'],
    );
    const baseBranch = values['base-branch'];
    if (baseBranch !== 'main' && !(await fileExistsAsync(join(target, '.changeset/config.json')))) {
      throw new Error('Supply --base-branch main for the managed npm release workflow.');
    }

    await initializeFilesAsync(
      target,
      { license, dryRun, baseBranch: baseBranch ?? 'main' },
      context,
    );
    if (!dryRun && JSON.stringify(manifest) !== JSON.stringify(planned)) {
      await writeFile(join(target, 'package.json'), `${JSON.stringify(planned, null, 2)}\n`);
    }

    const options = dryRun ? ['--dry-run'] : [];
    const metadata = await runRepositoryMetadataCommandAsync('init', [target, ...options], context);
    const sync = findDevtoolsCommandByPath(['sync']);
    if (sync?.kind !== 'repository') throw new Error('The managed sync command is unavailable.');
    const result = await runRepositoryCommand(sync, [target, ...options], {
      ...context,
      bootstrap: true,
    });
    if (result.exitCode !== 0 || metadata.exitCode !== 0) return { exitCode: 1 };
    await ensureReadmeAsync(target, dryRun, context);
    return { exitCode: 0 };
  } catch (error) {
    context.writeStderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return { exitCode: 1 };
  }
}

/*** Parse authored initialization inputs before making repository changes. */
async function parseBootstrapArgumentsAsync(argv: readonly string[], cwd: string) {
  const { values, positionals } = parseArgs({
    args: [...argv],
    allowPositionals: true,
    options: {
      'dry-run': { type: 'boolean' },
      'base-branch': { type: 'string' },
      'license-file': { type: 'string' },
      'copyright-owner': { type: 'string' },
    },
  });
  if (positionals.length > 1) throw new Error('Only one target path may be provided.');
  const target = await resolveManagedTargetDirectory(cwd, positionals[0]);
  const dryRun = values['dry-run'] === true;
  return { target, dryRun, values };
}

/*** Create the standalone files and initialize Changesets without modifying existing files. */
async function initializeFilesAsync(
  target: string,
  options: {
    readonly license: string | undefined;
    readonly dryRun: boolean;
    readonly baseBranch: string;
  },
  context: DevtoolsRepositoryCommandContext,
): Promise<void> {
  const { license, dryRun, baseBranch } = options;
  const results = await syncManagedFiles(
    target,
    license === undefined
      ? bootstrapFiles
      : [...bootstrapFiles, { relativePath: 'LICENSE', mode: 'create-only', contents: license }],
    { dryRun },
  );
  const changesets = await initializeBootstrapChangesetsAsync(target, baseBranch, dryRun);
  for (const { relativePath, action } of [...results, ...changesets]) {
    context.writeStdout(`${relativePath} ${action.replace('would-', 'would ')}\n`);
  }
}

/*** Generate missing README with the authored documentation script after installation. */
async function ensureReadmeAsync(
  target: string,
  dryRun: boolean,
  context: DevtoolsRepositoryCommandContext,
): Promise<void> {
  if (!(await fileExistsAsync(join(target, 'README.md')))) {
    context.writeStdout(
      dryRun ? 'README.md would generate with Paradox\n' : 'Generating README.md with Paradox\n',
    );
    if (!dryRun) await generateReadmeAsync(target);
  }
}

/*** Resolve version ranges from the released Devtools toolchain. */
async function readBootstrapToolchainAsync(): Promise<Record<string, unknown>> {
  const ownManifest = await readPackageManifestAsync(resolve(import.meta.dirname, '../../..'));
  return {
    ...(isRecord(ownManifest?.dependencies) ? ownManifest.dependencies : {}),
    ...(isRecord(ownManifest?.devDependencies) ? ownManifest.devDependencies : {}),
  };
}

/*** Read explicitly supplied license text when the repository lacks a license. */
async function readLicenseInputsAsync(
  target: string,
  licenseFile: string | undefined,
  copyrightOwner: string | undefined,
): Promise<string | undefined> {
  if (await fileExistsAsync(join(target, 'LICENSE'))) return undefined;
  if (
    licenseFile === undefined ||
    copyrightOwner?.trim() === undefined ||
    copyrightOwner.trim() === ''
  ) {
    throw new Error('Supply --license-file and --copyright-owner to create LICENSE.');
  }
  const contents = await readFile(resolve(target, licenseFile), 'utf8');
  if (!contents.includes(copyrightOwner))
    throw new Error('The license text must include the explicit copyright owner.');
  return contents;
}

/*** Distinguish absent artifacts from other filesystem errors. */
async function fileExistsAsync(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return false;
    throw error;
  }
}

/*** Execute the consumer's declared Paradox documentation script after installation. */
async function generateReadmeAsync(target: string): Promise<void> {
  const child = Bun.spawn(['bun', 'run', 'docs'], {
    cwd: target,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0 || !(await fileExistsAsync(join(target, 'README.md')))) {
    throw new Error('The documentation script must generate README.md.');
  }
}
