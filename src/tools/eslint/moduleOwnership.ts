import { basename, normalize } from 'node:path';

import type { ESLint, Rule } from 'eslint';

import type { FlatConfigItem } from './types.js';

const INDEX_BARREL_FILE = /^index\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/u;

interface ForwardExportCandidate {
  readonly node: Rule.Node;
  readonly localNames: readonly string[];
}

function isDirectForwardExport(context: Rule.RuleContext, node: Rule.Node): boolean {
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

function readNamedExportLocalNames(node: Rule.Node): readonly string[] {
  if (node.type !== 'ExportNamedDeclaration') return [];
  const { specifiers } = node as Rule.Node & { readonly specifiers?: readonly Rule.Node[] };
  if (!Array.isArray(specifiers)) return [];

  return specifiers.flatMap((specifier) => {
    if (specifier.type !== 'ExportSpecifier') return [];
    const { local } = specifier as Rule.Node & { readonly local?: Rule.Node };
    const name = readIdentifierName(local);
    return name === null ? [] : [name];
  });
}

function readDefaultExportLocalNames(node: Rule.Node): readonly string[] {
  if (node.type !== 'ExportDefaultDeclaration') return [];
  const { declaration } = node as Rule.Node & { readonly declaration?: Rule.Node };
  const name = readIdentifierName(declaration);
  return name === null ? [] : [name];
}

function readIdentifierName(node: Rule.Node | undefined): string | null {
  if (node?.type !== 'Identifier') return null;
  const { name } = node as Rule.Node & { readonly name?: unknown };
  return typeof name === 'string' ? name : null;
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
        'Forward exports are forbidden outside root package entrypoints and index barrels. Export symbols from their owning module.',
    },
  },
  create(context) {
    if (isAllowedForwardExportFile(context)) return {};

    const importedBindings = new Set<string>();
    const candidates: ForwardExportCandidate[] = [];

    return {
      ImportDeclaration(node: Rule.Node) {
        for (const variable of context.sourceCode.getDeclaredVariables(node)) {
          importedBindings.add(variable.name);
        }
      },
      ExportNamedDeclaration(node: Rule.Node) {
        if (isDirectForwardExport(context, node)) {
          context.report({ node, messageId: 'forwardExport' });
          return;
        }
        candidates.push({ node, localNames: readNamedExportLocalNames(node) });
      },
      ExportDefaultDeclaration(node: Rule.Node) {
        candidates.push({ node, localNames: readDefaultExportLocalNames(node) });
      },
      'Program:exit'() {
        for (const candidate of candidates) {
          if (candidate.localNames.some((name) => importedBindings.has(name))) {
            context.report({ node: candidate.node, messageId: 'forwardExport' });
          }
        }
      },
    };
  },
};

const moduleOwnershipPlugin = {
  rules: { 'no-forward-exports': noForwardExportsRule },
} satisfies ESLint.Plugin;

export function createModuleOwnershipConfig(
  files: string[],
  packageRootEntrypoints: string[] = [],
): FlatConfigItem {
  return {
    files,
    plugins: { ankhorage: moduleOwnershipPlugin },
    rules: {
      'ankhorage/no-forward-exports': ['error', { allowedFiles: packageRootEntrypoints }],
    },
  };
}
