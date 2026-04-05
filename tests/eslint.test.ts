import { describe, expect, it } from 'bun:test';
import { createConfig, defaultIgnores, defaultRestrictedImports } from '../src/eslint';

describe('createConfig', () => {
  const baseOptions = {
    tsconfigRootDir: '/root',
    project: ['./tsconfig.json'],
    files: ['src/**/*.ts'],
  };

  it('should return a basic config array', () => {
    const config = createConfig(baseOptions);
    expect(Array.isArray(config)).toBe(true);
    expect(config.length).toBeGreaterThan(0);
  });

  it('should include default ignores', () => {
    const config = createConfig(baseOptions);
    const ignoreConfig = config.find((c: any) => c.ignores);
    expect(ignoreConfig).toBeDefined();
    expect(ignoreConfig.ignores).toContain(defaultIgnores[0]);
  });

  it('should include additional ignores', () => {
    const additionalIgnores = ['**/custom-ignore/**'];
    const config = createConfig({ ...baseOptions, additionalIgnores });
    const ignoreConfig = config.find((c: any) => c.ignores);
    expect(ignoreConfig.ignores).toContain('**/custom-ignore/**');
  });

  it('should include default restricted imports', () => {
    const config = createConfig(baseOptions);
    const rulesConfig = config.find((c: any) => c.rules && c.rules['no-restricted-imports']);
    const restrictedImports = rulesConfig.rules['no-restricted-imports'][1].paths;
    expect(restrictedImports).toContainEqual(defaultRestrictedImports[0]);
  });

  it('should append additional restricted imports', () => {
    const restrictedImports = [{ name: 'custom-pkg', message: 'forbidden' }];
    const config = createConfig({ ...baseOptions, restrictedImports });
    const rulesConfig = config.find((c: any) => c.rules && c.rules['no-restricted-imports']);
    const paths = rulesConfig.rules['no-restricted-imports'][1].paths;
    expect(paths).toContainEqual(restrictedImports[0]);
    expect(paths).toContainEqual(defaultRestrictedImports[0]);
  });

  it('should include prettier by default', () => {
    const config = createConfig(baseOptions);
    // eslint-config-prettier usually only has a rules block (no plugins, no files, no languageOptions)
    const hasPrettier = config.some(
      (c: any) => c.rules && !c.plugins && !c.files && !c.languageOptions && !c.ignores,
    );
    expect(hasPrettier).toBe(true);
  });

  it('should optionally exclude prettier', () => {
    const config = createConfig({ ...baseOptions, includePrettier: false });
    // console.log(JSON.stringify(config, null, 2));
    const hasPrettier = config.some(
      (c: any) =>
        c.rules &&
        !c.plugins &&
        !c.files &&
        !c.languageOptions &&
        !c.ignores &&
        c.rules['prettier/prettier'],
    );
    expect(hasPrettier).toBe(false);
  });
});
