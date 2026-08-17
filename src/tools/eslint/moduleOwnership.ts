import { basename, normalize } from 'node:path';

import type { ESLint, Rule } from 'eslint';

import type { FlatConfigItem } from './types.js';

const INDEX_BARREL_FILE = /^index\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;

function isForwardExport(context: Rule.RuleContext, node: Rule.Node): boolean {
  const tokens = context.sourceCode.getTokens(node);
  if (tokens.at(0)?.value !== 'export') return false;
  return tokens.some(
    (token, index) => token.value === 'from' && tokens.at(index + 1)?.type === 'String',
  );
}

function isAllowedForwardExportFile(context: Rule.RuleContext): boolean {
  const filename = normalize(context.filename);
  if (INDEX_BARREL_FILE.test(basename(filename))) return true;
  return readAllowedFiles(context.options.at(0)).some((file) => normalize(file) === filename);
}

function readAllowedFiles(value: unknown): readonly string[] {
  if (!isRecord(value)) return [];
  const { allowedFiles } = value;
  if (!Array.isArray(allowedFiles)) return [];
  return allowedFiles.filter((file): file is string => typeof file === 'string');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const noForwardExportsRule: Rule.RuleModule = {
  meta: {
    type: 'problem',
    schema: [
      {
        type: 'object',
        properties: {
          allowedFiles: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      forwardExport:
        'Forward exports are forbidden outside package entrypoints and index barrels. Import directly from the owning module.',
    },
  },
  create(context) {
    if (isAllowedForwardExportFile(context)) return {};
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
    plugins: { ankhorage: moduleOwnershipPlugin },
    rules: {
      'ankhorage/no-forward-exports': ['error', { allowedFiles: packageEntrypoints }],
    },
  };
}
