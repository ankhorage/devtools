import type { StructureDescriptor, StructureLiteralValue } from '@ankhorage/contracts/structure';
import ts from 'typescript';

import type { StructureCompilerContext } from '../../../types/structure-generation.js';
import { resolveSemanticStructureWrapper } from './resolveSemanticStructureWrapper.js';
import { resolveStructureSymbolPackage } from './resolveStructureSymbolPackage.js';

interface StructureObjectField {
  readonly value: StructureDescriptor;
  readonly optional?: boolean;
}

/*** Resolve one TypeScript type into the canonical structural descriptor graph. */
export function resolveStructureType(
  type: ts.Type,
  context: StructureCompilerContext,
  inlineSymbol?: ts.Symbol,
): StructureDescriptor {
  const wrapper = resolveSemanticStructureWrapper(type, context, (value) =>
    resolveStructureType(value, context),
  );
  if (wrapper) return wrapper;

  const symbol = resolveNamedSymbol(type);
  if (symbol && symbol !== inlineSymbol) return resolveNamedType(symbol, type, context);
  return resolveTypeBody(type, context);
}

/*** Resolve a named local type by reference or preserve an external owner reference. */
function resolveNamedType(
  symbol: ts.Symbol,
  type: ts.Type,
  context: StructureCompilerContext,
): StructureDescriptor {
  const owner = resolveStructureSymbolPackage(symbol, context);
  const id = stableSymbolName(symbol);
  if (owner && owner !== context.packageName) return { kind: 'ref', packageName: owner, id };

  ensureStructureDefinition(symbol, type, context);
  return { kind: 'ref', id };
}

/*** Materialize one local named descriptor exactly once while supporting recursive references. */
function ensureStructureDefinition(
  symbol: ts.Symbol,
  type: ts.Type,
  context: StructureCompilerContext,
): void {
  const id = stableSymbolName(symbol);
  const previous = context.definitionSymbols.get(id);
  if (previous && previous !== symbol) {
    throw new Error(`Duplicate structural descriptor id "${id}" in ${context.packageName}.`);
  }
  if (context.definitions.has(id) || context.resolving.has(id)) return;

  context.definitionSymbols.set(id, symbol);
  context.resolving.add(id);
  const descriptor = resolveStructureType(type, context, symbol);
  context.definitions.set(id, { id, descriptor });
  context.resolving.delete(id);
}

/*** Resolve primitives, literals, arrays, unions, and fixed object shapes. */
function resolveTypeBody(type: ts.Type, context: StructureCompilerContext): StructureDescriptor {
  const primitive = resolvePrimitive(type);
  if (primitive) return primitive;

  const literal = resolveLiteral(type, context.checker);
  if (literal !== undefined) return { kind: 'enum', values: [literal] };
  if (type.isUnion()) return resolveUnion(type, context);

  const arrayItem = resolveArrayItem(type, context.checker);
  if (arrayItem) {
    return { kind: 'ordered-list', item: resolveStructureType(arrayItem, context) };
  }
  if ((type.flags & ts.TypeFlags.Object) !== 0) return resolveObject(type, context);

  throw unsupportedType(type, context, 'unsupported TypeScript type');
}

/*** Resolve JSON-safe scalar primitives. */
function resolvePrimitive(type: ts.Type): StructureDescriptor | null {
  if ((type.flags & ts.TypeFlags.String) !== 0) return { kind: 'scalar', type: 'string' };
  if ((type.flags & ts.TypeFlags.Number) !== 0) return { kind: 'scalar', type: 'number' };
  if ((type.flags & ts.TypeFlags.Boolean) !== 0) return { kind: 'scalar', type: 'boolean' };
  if ((type.flags & ts.TypeFlags.Null) !== 0) return { kind: 'scalar', type: 'null' };
  return null;
}

/*** Resolve one scalar literal while leaving non-literal types untouched. */
function resolveLiteral(type: ts.Type, checker: ts.TypeChecker): StructureLiteralValue | undefined {
  if (type.isStringLiteral()) return type.value;
  if (type.isNumberLiteral()) return type.value;
  if ((type.flags & ts.TypeFlags.BooleanLiteral) !== 0) {
    return checker.typeToString(type) === 'true';
  }
  if ((type.flags & ts.TypeFlags.Null) !== 0) return null;
  return undefined;
}

/*** Resolve finite literal unions or a deterministic general union descriptor. */
function resolveUnion(type: ts.UnionType, context: StructureCompilerContext): StructureDescriptor {
  const effective = type.types.filter((entry) => (entry.flags & ts.TypeFlags.Undefined) === 0);
  if (effective.length === 0) throw unsupportedType(type, context, 'undefined-only union');

  if (effective.length === 1) return resolveStructureType(effective[0], context);

  const literals = effective.map((entry) => resolveLiteral(entry, context.checker));
  if (literals.every(isDefinedLiteral)) {
    return { kind: 'enum', values: sortLiterals(literals) };
  }

  const variants = effective.map((entry) => resolveStructureType(entry, context));
  variants.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const discriminator = resolveUnionDiscriminator(effective, context.checker);
  return { kind: 'union', variants, ...(discriminator ? { discriminator } : {}) };
}

/*** Narrow an optional scalar literal after union projection. */
function isDefinedLiteral(
  value: StructureLiteralValue | undefined,
): value is StructureLiteralValue {
  return value !== undefined;
}

/*** Resolve a homogeneous Array/ReadonlyArray element type while rejecting tuples. */
function resolveArrayItem(type: ts.Type, checker: ts.TypeChecker): ts.Type | null {
  if (checker.isTupleType(type)) {
    throw new Error('Tuple types are not supported by structural descriptor generation.');
  }
  if (checker.isArrayType(type)) {
    return checker.getTypeArguments(type as ts.TypeReference).at(0) ?? null;
  }
  if ((type.flags & ts.TypeFlags.Object) === 0) return null;

  const symbolName = type.getSymbol()?.getName();
  if (symbolName !== 'ReadonlyArray') return null;
  return checker.getTypeArguments(type as ts.TypeReference).at(0) ?? null;
}

/*** Resolve a fixed object shape and reject unmarked records or executable objects. */
function resolveObject(type: ts.Type, context: StructureCompilerContext): StructureDescriptor {
  if (type.getCallSignatures().length > 0 || type.getConstructSignatures().length > 0) {
    throw unsupportedType(type, context, 'callable/class-like object');
  }
  if (context.checker.getIndexTypeOfType(type, ts.IndexKind.String)) {
    throw unsupportedType(type, context, 'unmarked string-indexed record');
  }

  const fields = Object.fromEntries(
    type
      .getProperties()
      .map((property) => resolveObjectField(property, context))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
  return { kind: 'object', fields };
}

/*** Resolve one object property including optionality while rejecting methods. */
function resolveObjectField(
  property: ts.Symbol,
  context: StructureCompilerContext,
): readonly [string, StructureObjectField] {
  const declaration = property.valueDeclaration ?? property.declarations?.at(0);
  if (!declaration) throw new Error(`Property "${property.getName()}" has no source declaration.`);
  if (ts.isMethodDeclaration(declaration) || ts.isMethodSignature(declaration)) {
    throw new Error(`Method "${property.getName()}" is not a serializable structural field.`);
  }

  const propertyType = context.checker.getTypeOfSymbolAtLocation(property, declaration);
  return [
    property.getName(),
    {
      value: resolveStructureType(propertyType, context),
      ...((property.flags & ts.SymbolFlags.Optional) !== 0 ? { optional: true } : {}),
    },
  ];
}

/*** Resolve a stable discriminator shared by every object-like union variant. */
function resolveUnionDiscriminator(
  variants: readonly ts.Type[],
  checker: ts.TypeChecker,
): string | null {
  const first = variants[0];
  const candidates = first
    .getProperties()
    .map((property) => property.getName())
    .sort();

  for (const name of candidates) {
    const values = variants.map((variant) => resolveDiscriminatorValue(variant, name, checker));
    if (values.every((value) => value !== null) && new Set(values).size === values.length) {
      return name;
    }
  }
  return null;
}

/*** Resolve one string/number literal discriminator value from an object variant. */
function resolveDiscriminatorValue(
  type: ts.Type,
  name: string,
  checker: ts.TypeChecker,
): string | number | null {
  const property = type.getProperty(name);
  if (!property) return null;
  const declaration = property.valueDeclaration ?? property.declarations?.at(0);
  if (!declaration) return null;

  const value = checker.getTypeOfSymbolAtLocation(property, declaration);
  if (value.isStringLiteral() || value.isNumberLiteral()) return value.value;
  return null;
}

/*** Return the meaningful alias/interface symbol for reference identity. */
function resolveNamedSymbol(type: ts.Type): ts.Symbol | null {
  const symbol = type.aliasSymbol ?? type.getSymbol();
  if (!symbol) return null;

  const name = symbol.getName();
  return name.startsWith('__') || name === 'Array' || name === 'ReadonlyArray' ? null : symbol;
}

/*** Require one stable source-level symbol name independent of declaration file paths. */
function stableSymbolName(symbol: ts.Symbol): string {
  const name = symbol.getName();
  if (name.startsWith('__')) throw new Error('Structural descriptor symbols need stable names.');
  return name;
}

/*** Sort finite scalar values deterministically without changing scalar identity. */
function sortLiterals(values: readonly StructureLiteralValue[]): readonly StructureLiteralValue[] {
  return [...values].sort((left, right) =>
    `${typeof left}:${String(left)}`.localeCompare(`${typeof right}:${String(right)}`),
  );
}

/*** Create one actionable unsupported-type error without exposing source paths. */
function unsupportedType(type: ts.Type, context: StructureCompilerContext, reason: string): Error {
  return new Error(
    `Cannot generate structure for ${context.checker.typeToString(type)}: ${reason}.`,
  );
}
