import { syncManagedFiles } from '../managed-files/managedFiles.js';

/*** Initialize the Changesets files without invoking the interactive upstream command. */
export async function initializeBootstrapChangesetsAsync(
  targetDirectory: string,
  baseBranch: string,
  dryRun: boolean,
) {
  const config = {
    $schema: 'https://unpkg.com/@changesets/config@4.0.1/schema.json',
    baseBranch,
    access: 'public',
    format: 'auto',
    changelog: '@changesets/cli/changelog',
    commit: false,
    ignore: [],
    fixed: [],
    linked: [],
    updateInternalDependencies: 'patch',
  };
  const readme = new URL(
    './default-files/README.md',
    import.meta.resolve('@changesets/cli/bin.js'),
  );
  return await syncManagedFiles(
    targetDirectory,
    [
      {
        relativePath: '.changeset/config.json',
        mode: 'create-only',
        contents: `${JSON.stringify(config, null, 2)}\n`,
      },
      {
        relativePath: '.changeset/README.md',
        mode: 'create-only',
        sourceUrl: readme,
      },
    ],
    { dryRun },
  );
}
