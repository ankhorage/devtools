import type { ESLint, Rule } from 'eslint';

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

const noForwardExportsRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forwardExport:
        'Forward exports are forbidden outside index barrels. Import directly from the owning module.',
    },
  },
  create(context) {
    const report = (node: Rule.Node) => context.report({ node, messageId: 'forwardExport' });
    return {
      ExportAllDeclaration: report,
      ExportNamedDeclaration(node) {
        if (node.source !== null) {
          report(node);
        }
      },
    };
  },
};

const moduleOwnershipPlugin = {
  rules: { 'no-forward-exports': noForwardExportsRule },
} satisfies ESLint.Plugin;

export function createModuleOwnershipConfig(files: string[]): FlatConfigItem {
  return {
    files,
    ignores: [...INDEX_BARREL_FILES],
    plugins: { ankhorage: moduleOwnershipPlugin },
    rules: { 'ankhorage/no-forward-exports': 'error' },
  };
}
