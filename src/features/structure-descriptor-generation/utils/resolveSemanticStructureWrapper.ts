import type { StructureDescriptor } from '@ankhorage/contracts/structure';
import ts from 'typescript';

import type { StructureCompilerContext } from '../../../types/structure-generation.js';
import { resolveStructureSymbolPackage } from './resolveStructureSymbolPackage.js';

type ResolveType = (type: ts.Type) => StructureDescriptor;

interface WrapperMatch {
  readonly name: string;
  readonly arguments: readonly ts.Type[];
}

interface EntityRegistryIdentity {
  readonly identityField?: string;
}

/*** Resolve canonical Contracts collection wrappers before generic TypeScript object expansion. */
export function resolveSemanticStructureWrapper(
  type: ts.Type,
  context: StructureCompilerContext,
  resolveType: ResolveType,
): StructureDescriptor | null {
  const match = resolveWrapperMatch(type, context, new Set());
  return match ? buildWrapperDescriptor(match.name, match.arguments, context, resolveType) : null;
}

/*** Follow source alias declarations until the exact canonical Contracts wrapper is reached. */
function resolveWrapperMatch(
  type: ts.Type,
  context: StructureCompilerContext,
  visited: Set<ts.Symbol>,
): WrapperMatch | null {
  const direct = resolveDirectWrapper(type, context);
  if (direct) return direct;

  const { aliasSymbol } = type;
  if (!aliasSymbol || visited.has(aliasSymbol)) return null;
  const nextVisited = new Set(visited);
  nextVisited.add(aliasSymbol);

  const declaration = aliasSymbol.declarations?.find(ts.isTypeAliasDeclaration);
  if (!declaration) return null;

  const targetType = context.checker.getTypeFromTypeNode(declaration.type);
  const nested = targetType === type ? null : resolveWrapperMatch(targetType, context, nextVisited);
  if (nested) return nested;

  if (!ts.isTypeReferenceNode(declaration.type)) return null;
  return resolveWrapperFromReferenceNode(declaration.type, context);
}

/*** Resolve one source-level type reference against its final imported/re-exported symbol. */
function resolveWrapperFromReferenceNode(
  reference: ts.TypeReferenceNode,
  context: StructureCompilerContext,
): WrapperMatch | null {
  const rawSymbol = context.checker.getSymbolAtLocation(reference.typeName);
  if (!rawSymbol) return null;

  const symbol = resolveAliasedSymbol(rawSymbol, context.checker);
  if (resolveStructureSymbolPackage(symbol, context) !== '@ankhorage/contracts') return null;

  const name = symbol.getName();
  if (!WRAPPER_NAMES.has(name)) return null;
  return {
    name,
    arguments:
      reference.typeArguments?.map((argument) => context.checker.getTypeFromTypeNode(argument)) ??
      [],
  };
}

/*** Resolve TypeScript import/re-export alias chains to their final declaration symbol. */
function resolveAliasedSymbol(
  symbol: ts.Symbol,
  checker: ts.TypeChecker,
  visited: ReadonlySet<ts.Symbol> = new Set(),
): ts.Symbol {
  if ((symbol.flags & ts.SymbolFlags.Alias) === 0 || visited.has(symbol)) return symbol;

  const next = checker.getAliasedSymbol(symbol);
  if (next === symbol) return symbol;

  const nextVisited = new Set(visited);
  nextVisited.add(symbol);
  return resolveAliasedSymbol(next, checker, nextVisited);
}

/*** Match a direct instantiation of one canonical collection wrapper. */
function resolveDirectWrapper(
  type: ts.Type,
  context: StructureCompilerContext,
): WrapperMatch | null {
  const rawSymbol = type.aliasSymbol;
  if (!rawSymbol) return null;

  const symbol = resolveAliasedSymbol(rawSymbol, context.checker);
  if (resolveStructureSymbolPackage(symbol, context) !== '@ankhorage/contracts') return null;

  const name = symbol.getName();
  if (!WRAPPER_NAMES.has(name)) return null;
  return { name, arguments: type.aliasTypeArguments ?? [] };
}

/*** Convert one canonical wrapper instantiation to its portable descriptor kind. */
function buildWrapperDescriptor(
  name: string,
  arguments_: readonly ts.Type[],
  context: StructureCompilerContext,
  resolveType: ResolveType,
): StructureDescriptor {
  if (name === 'SerializableSet') {
    return {
      kind: 'set',
      member: resolveType(arguments_.at(0) ?? context.checker.getStringType()),
    };
  }

  const key = arguments_.at(0);
  const value = arguments_.at(1);
  if (!key || !value) throw new Error(`${name} requires key and value type arguments.`);

  if (name === 'ValueMap') {
    return {
      kind: 'value-map',
      key: resolveType(key),
      value: resolveType(value),
    };
  }

  const identity = arguments_.at(2);
  return {
    kind: 'entity-registry',
    key: resolveType(key),
    value: resolveType(value),
    ...resolveIdentityField(identity),
  };
}

/*** Resolve an EntityRegistry identity-field marker from a string literal type argument. */
function resolveIdentityField(type: ts.Type | undefined): EntityRegistryIdentity {
  if (!type || (type.flags & ts.TypeFlags.Never) !== 0) return {};
  return type.isStringLiteral() ? { identityField: type.value } : {};
}

const WRAPPER_NAMES = new Set(['EntityRegistry', 'SerializableSet', 'ValueMap']);
