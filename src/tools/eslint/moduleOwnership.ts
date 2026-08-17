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

function isForwardExport(context: Rule.RuleContext, node: Rule.Node): boolean {
  const tokens = context.sourceCode.getTokens(node);
  if (tokens.at(0)?.value !== 'export') return false;
  return tokens.some(
    (token, index) => token.value === 'from' && tokens.at(index + 1)?.type === 'String',
  );
}

const noForwardExportsRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [],
    messages: {
      forwardExport:
        'Forward exports are forbidden outside package entrypoints and index barrels. Import directly from the owning module.',
    },
  },
  create(context) {
    return {
      'Program > *'(node: Rule.Node) {
        if (isForwardExport(context, node)) context.report({ node, messageId: 'forwardExport' });
      },
    };
  },
};

const moduleOwnershipPlugin = {
  rules: { 'no-forward-exports': noForwardExportsRule },
} satisfies ESLint.Plugin;

export function createModuleOwnershipConfig(
  files: string[],
  packageEntrypoints: string[] = [],
): FlatConfigItem {
  return {
    files,
    ignores: [...INDEX_BARREL_FILES, ...packageEntrypoints],
    plugins: { ankhorage: moduleOwnershipPlugin },
    rules: { 'ankhorage/no-forward-exports': 'error' },
  };
}
