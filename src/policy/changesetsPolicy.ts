export const changesetsPolicy = {
  packageName: '@changesets/cli',
  binaryName: 'ankhorage-changeset',
  packageScripts: {
    changeset: 'ankhorage-changeset',
    'changeset:status': 'ankhorage-changeset status --since=origin/main',
    'version-packages': 'ankhorage-changeset version',
  },
  ownerPackageScripts: {
    changeset: 'bun src/cli/bin/changeset.ts',
    'changeset:status': 'bun src/cli/bin/changeset.ts status --since=origin/main',
    'version-packages': 'bun src/cli/bin/changeset.ts version',
  },
  workflowCommands: {
    status: 'bun run changeset:status',
    versionPackagesStatus: 'bun run changeset -- status',
    version: 'bun run version-packages',
    publish: 'bun run changeset -- publish',
  },
} as const;
