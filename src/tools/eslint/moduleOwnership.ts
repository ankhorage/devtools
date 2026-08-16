import type { FlatConfigItem } from './types.js';

const INDEX_BARREL_FILES = [
  '**/index.ts',
  '**/index.tsx',
  '**/index.js',
  '**/index.jsx',
  '**/index.mts',
  '**/index.cts',
  '**/index.mjs',
  '**/index.cjs',
] as const;

export function createModuleOwnershipConfig(files: string[]): FlatConfigItem {
  return {
    files,
    ignores: [...INDEX_BARREL_FILES],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ExportAllDeclaration',
          message:
            'Forward exports are forbidden outside index barrels. Import directly from the owning module.',
        },
        {
          selector: 'ExportNamedDeclaration[source]',
          message:
            'Forward exports are forbidden outside index barrels. An export belongs to the file where it is defined.',
        },
        {
          selector: 'ExportNamedDeclaration[exportKind="type"][source]',
          message:
            'Forward type exports are forbidden outside index barrels. A type export belongs to the file where it is defined.',
        },
      ],
    },
  };
}
