import type { ManagedFileDefinition } from '../shared/managedFiles.js';

export const vscodeFiles = [
  {
    targetPath: '.vscode/settings.json',
    sourceUrl: new URL('./files/settings.json', import.meta.url),
  },
  {
    targetPath: '.vscode/extensions.json',
    sourceUrl: new URL('./files/extensions.json', import.meta.url),
  },
] as const satisfies readonly ManagedFileDefinition[];
