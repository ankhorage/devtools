import { relative, sep } from 'node:path';

import type ts from 'typescript';

import type { StructureCompilerContext } from '../../../types/structure-generation.js';

/*** Resolve the owning npm package for a TypeScript symbol without exposing source paths in artifacts. */
export function resolveStructureSymbolPackage(
  symbol: ts.Symbol,
  context: StructureCompilerContext,
): string | null {
  const declaration = symbol.declarations?.[0];
  if (!declaration) return null;

  const fileName = declaration.getSourceFile().fileName;
  const relativePath = relative(context.targetDirectory, fileName);
  if (relativePath !== '..' && !relativePath.startsWith(`..${sep}`) && !relativePath.startsWith('..')) {
    return context.packageName;
  }

  const normalized = fileName.replaceAll('\\', '/');
  const marker = '/node_modules/';
  const markerIndex = normalized.lastIndexOf(marker);
  if (markerIndex < 0) return null;

  const packagePath = normalized.slice(markerIndex + marker.length);
  const segments = packagePath.split('/');
  const first = segments.at(0);
  if (!first) return null;
  if (!first.startsWith('@')) return first;

  const second = segments.at(1);
  return second ? `${first}/${second}` : null;
}
