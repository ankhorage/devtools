import type { ManagedFileSyncResult } from '../features/managed-files/managedFiles.js';

/*** Shared process context for repository-management command adapters. */
export interface DevtoolsRepositoryCommandContext {
  readonly cwd: string;
  readonly syncDependencies?: (targetDirectory: string) => Promise<ManagedFileSyncResult>;
  writeStdout(text: string): void;
  writeStderr(text: string): void;
}

/*** Shared process context for all Devtools provider command adapters. */
export interface DevtoolsProviderCommandContext extends DevtoolsRepositoryCommandContext {
  readonly env: Readonly<Record<string, string | undefined>>;
}
