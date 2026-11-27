import { expect, test } from 'bun:test';

import { planBootstrapManifest } from './planBootstrapManifest.js';

const manifest = {
  name: '@ankhorage/bootstrap-fixture',
  version: '0.1.0',
  description: 'Fixture for bootstrap planning',
  repository: { type: 'git', url: 'git+https://github.com/ankhorage/bootstrap-fixture.git' },
  homepage: 'https://github.com/ankhorage/bootstrap-fixture',
  bugs: { url: 'https://github.com/ankhorage/bootstrap-fixture/issues' },
  license: 'MIT',
  keywords: ['fixture'],
  publishConfig: { access: 'public' },
};

test('plans compatible entrypoints and keeps authored scripts and dependency ranges', () => {
  const authored = {
    ...manifest,
    scripts: { test: 'bun test src' },
    devDependencies: { typescript: '~6.0.3' },
  };
  const toolchain = {
    typescript: '~6.0.2',
    '@types/node': '^26.6.11',
    '@ankhorage/paradox': '^0.6.0',
  };
  const result = planBootstrapManifest(authored, toolchain);
  expect(result.scripts).toMatchObject({
    build: 'tsc -p tsconfig.build.json',
    test: 'bun test src',
  });
  expect(result.devDependencies).toMatchObject({ typescript: authored.devDependencies.typescript });
  expect(result.exports).toEqual({
    '.': { types: './dist/index.d.ts', default: './dist/index.js' },
  });
  expect(planBootstrapManifest(result, toolchain)).toEqual(result);
});

test('reports missing authored fields and leaves private manifests unchanged', () => {
  expect(() => planBootstrapManifest({ publishConfig: manifest.publishConfig }, {})).toThrow(
    'Supply authored package.json fields',
  );
  const privatePackage = { ...manifest, private: true };
  expect(() => planBootstrapManifest(privatePackage, {})).toThrow('Set publishConfig.access');
  expect(privatePackage).toEqual({ ...manifest, private: true });
});
