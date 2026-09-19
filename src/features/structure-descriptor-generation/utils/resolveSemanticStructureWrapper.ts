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
  const direct = resolveDirectWrapper(type, context);
  if (direct) {
    return buildWrapperDescriptor(direct.name, direct.arguments, context, resolveType);
  }

  const alias = type.aliasSymbol?.declarations?.find(ts.isTypeAliasDeclaration);
  if (!alias || !ts.isTypeReferenceNode(alias.type)) return null;

  const rawSymbol = context.checker.getSymbolAtLocation(alias.type.typeName);
  if (!rawSymbol) return null;
  const symbol =
    (rawSymbol.flags & ts.SymbolFlags.Alias) !== 0
      ? context.checker.getAliasedSymbol(rawSymbol)
      : rawSymbol;
  if (resolveStructureSymbolPackage(symbol, context) !== '@ankhorage/contracts') {
    return null;
  }

  const name = symbol.getName();
  if (!WRAPPER_NAMES.has(name)) return null;
  const arguments_ =
    alias.type.typeArguments?.map((argument) =>
      context.checker.getTypeFromTypeNode(argument),
    ) ?? [];
  return buildWrapperDescriptor(name, arguments_, context, resolveType);
}

/*** Match a direct instantiation of one canonical collection wrapper. */
function resolveDirectWrapper(
  type: ts.Type,
  context: StructureCompilerContext,
): WrapperMatch | null {
  const symbol = type.aliasSymbol;
  if (
    !symbol ||
    resolveStructureSymbolPackage(symbol, context) !== '@ankhorage/contracts'
  ) {
    return null;
  }

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
