import type { ManagedFileDefinition } from '../shared/managedFiles.js';

export const vscodeManagedFiles = [
  {
    relativePath: '.vscode/settings.json',
    sourceUrl: new URL('./files/settings.json', import.meta.url),
  },
  {
    relativePath: '.vscode/extensions.json',
    sourceUrl: new URL('./files/extensions.json', import.meta.url),
  },
] as const satisfies readonly ManagedFileDefinition[];
