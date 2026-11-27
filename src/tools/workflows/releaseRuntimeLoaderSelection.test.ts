import { expect, test } from 'bun:test';

test('packed runtime loader selection uses import for import-only ESM exports', () => {
  expect(
    selectPackedRuntimeLoaders({
      default: './dist/index.js',
      import: './dist/index.js',
      node: './dist/index.js',
    }),
  ).toEqual(['import']);
});

test('packed runtime loader selection retains explicit CommonJS and dual-condition verification', () => {
  expect(selectPackedRuntimeLoaders({ require: './dist/index.cjs' })).toEqual(['require']);
  expect(
    selectPackedRuntimeLoaders({ import: './dist/index.js', require: './dist/index.cjs' }),
  ).toEqual(['import', 'require']);
  const platformTarget = {
    'react-native': './src/index.ts',
    browser: './src/index.ts',
    import: './dist/index.js',
    default: './dist/index.js',
  };
  expect(selectPackedRuntimeLoaders(platformTarget, true)).toEqual(['react-native']);
  expect(selectPackedRuntimeLoaders(platformTarget, false)).toEqual(['import']);
});

/*** Mirror the managed workflow's environment-aware packed runtime loader decisions. */
function selectPackedRuntimeLoaders(
  target: unknown,
  hasPlatformToolchain = false,
): ('import' | 'react-native' | 'require')[] {
  const importConditions = new Set(['bun', 'default', 'import', 'node']);
  const requireConditions = new Set(['require']);
  const reactNativeConditions = new Set(['react-native']);
  const platformConditions = new Set(['browser', 'react-native']);
  const explicitServerConditions = new Set(['bun', 'node']);
  const supportsLoader = (value: unknown, conditions: ReadonlySet<string>): boolean => {
    if (typeof value === 'string') return true;
    if (Array.isArray(value)) return value.some((entry) => supportsLoader(entry, conditions));
    if (!isConditionMap(value)) return false;
    return Object.entries(value).some(
      ([condition, entry]) => conditions.has(condition) && supportsLoader(entry, conditions),
    );
  };
  const declaresCondition = (value: unknown, conditions: ReadonlySet<string>): boolean => {
    if (Array.isArray(value)) return value.some((entry) => declaresCondition(entry, conditions));
    if (!isConditionMap(value)) return false;
    return Object.entries(value).some(
      ([condition, entry]) => conditions.has(condition) || declaresCondition(entry, conditions),
    );
  };
  const platformOnly =
    declaresCondition(target, platformConditions) &&
    !declaresCondition(target, explicitServerConditions);
  if (platformOnly && declaresCondition(target, reactNativeConditions)) {
    if (hasPlatformToolchain) return ['react-native'];
    return supportsLoader(target, importConditions) ? ['import'] : [];
  }
  if (platformOnly) return [];
  return [['import', importConditions] as const, ['require', requireConditions] as const].flatMap(
    ([loader, conditions]) => (supportsLoader(target, conditions) ? [loader] : []),
  );
}

/*** Narrow conditional export maps used by the workflow contract fixture. */
function isConditionMap(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
