import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'bun:test';
import { ESLint } from 'eslint';

import { createConfig } from './index.js';
import type { DevtoolsEslintProfile } from './types.js';

type LintResult = Awaited<ReturnType<ESLint['lintFiles']>>[number];

interface LintWorkspace {
  readonly root: string;
  lint(code: string, fileName: string, fix?: boolean): Promise<LintResult>;
  lintFile(fileName: string, fix?: boolean): Promise<LintResult>;
  write(code: string, fileName: string): Promise<void>;
}

async function createLintWorkspace(
  profile: DevtoolsEslintProfile = 'base',
): Promise<LintWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'ankhorage-eslint-'));
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { strict: true, jsx: 'react-jsx' },
      include: ['**/*.ts', '**/*.tsx'],
    }),
  );

  async function write(code: string, fileName: string): Promise<void> {
    const filePath = path.join(root, fileName);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, code);
  }

  async function lintFile(fileName: string, fix = false): Promise<LintResult> {
    const filePath = path.join(root, fileName);
    const eslint = new ESLint({
      cwd: root,
      fix,
      overrideConfigFile: true,
      overrideConfig: createConfig({
        tsconfigRootDir: root,
        project: ['./tsconfig.json'],
        files: ['**/*.{ts,tsx}'],
        profile,
      }),
    });
    const [result] = await eslint.lintFiles([filePath]);
    return result;
  }

  return {
    root,
    async lint(code, fileName, fix = false) {
      await write(code, fileName);
      return lintFile(fileName, fix);
    },
    lintFile,
    write,
  };
}

async function lintFresh(code: string, fileName: string): Promise<LintResult> {
  const workspace = await createLintWorkspace();
  return workspace.lint(code, fileName);
}

function ruleIds(result: LintResult): string[] {
  expect(result.messages.filter((message) => message.fatal === true)).toEqual([]);
  return result.messages.flatMap((message) => (message.ruleId === null ? [] : [message.ruleId]));
}

it('executes import sorting through the composed shared config', async () => {
  const workspace = await createLintWorkspace();
  const source = "import { z } from 'z';\nimport { a } from 'a';\n\nvoid a;\nvoid z;\n";
  const result = await workspace.lint(source, 'imports.ts');
  expect(ruleIds(result)).toContain('simple-import-sort/imports');

  const fixed = await workspace.lint(source, 'imports.ts', true);
  const output = fixed.output ?? '';
  expect(output.indexOf('from "a"')).toBeLessThan(output.indexOf('from "z"'));
});

it('preserves base import sorting in React profiles', async () => {
  const source = "import { z } from 'z';\nimport { a } from 'a';\n\nvoid a;\nvoid z;\n";
  for (const profile of ['react', 'react-native'] as const) {
    const workspace = await createLintWorkspace(profile);
    const result = await workspace.lint(source, `${profile}.ts`);
    expect(ruleIds(result)).toContain('simple-import-sort/imports');
  }
});

it('executes profile-specific React and React Native rules', async () => {
  const react = await createLintWorkspace('react');
  const reactResult = await react.lint(
    "const html = '<b>x</b>';\nexport const view = <div dangerouslySetInnerHTML={{ __html: html }} />;\n",
    'react.tsx',
  );
  expect(ruleIds(reactResult)).toContain('react/no-danger');

  const native = await createLintWorkspace('react-native');
  const nativeResult = await native.lint(
    'export const view = <View style={{ flex: 1 }} />;\n',
    'native.tsx',
  );
  expect(ruleIds(nativeResult)).toContain('react-native/no-inline-styles');
});

it('keeps export sorting active inside index barrels', async () => {
  const workspace = await createLintWorkspace();
  const source = "export { z } from './z';\nexport { a } from './a';\n";
  const result = await workspace.lint(source, 'index.ts');
  expect(ruleIds(result)).toContain('simple-import-sort/exports');
  expect(ruleIds(result)).not.toContain('ankhorage/no-forward-exports');
});

it('allows forward exports only from root package entrypoints and index barrels', async () => {
  const workspace = await createLintWorkspace();
  await writeFile(
    path.join(workspace.root, 'package.json'),
    JSON.stringify({
      main: './dist/root.js',
      types: './dist/root.d.ts',
      exports: {
        '.': {
          types: './dist/root.d.ts',
          import: './dist/root.js',
        },
        './binding': {
          types: './dist/bindingAuthoringModel.d.ts',
          import: './dist/bindingAuthoringModel.js',
        },
      },
    }),
  );

  await Promise.all([
    workspace.write("export * from './value';\n", 'src/root.ts'),
    workspace.write("export { value } from './value';\n", 'src/bindingAuthoringModel.ts'),
    workspace.write("export * from './value';\n", 'src/implementation.ts'),
  ]);

  const root = await workspace.lintFile('src/root.ts');
  const namedSubpath = await workspace.lintFile('src/bindingAuthoringModel.ts');
  const undeclared = await workspace.lintFile('src/implementation.ts');

  expect(ruleIds(root)).not.toContain('ankhorage/no-forward-exports');
  expect(ruleIds(namedSubpath)).toContain('ankhorage/no-forward-exports');
  expect(ruleIds(undeclared)).toContain('ankhorage/no-forward-exports');
});

it('rejects named, type, and star direct forward exports outside barrels', async () => {
  const named = await lintFresh("export { value } from './value';\n", 'named.ts');
  const typed = await lintFresh("export type { Value } from './value';\n", 'typed.ts');
  const star = await lintFresh("export * from './value';\n", 'star.ts');

  expect(ruleIds(named)).toContain('ankhorage/no-forward-exports');
  expect(ruleIds(typed)).toContain('ankhorage/no-forward-exports');
  expect(ruleIds(star)).toContain('ankhorage/no-forward-exports');
});

it('rejects imported bindings re-exported through local export syntax', async () => {
  const named = await lintFresh(
    "import { value } from './value';\nexport { value };\n",
    'named-indirect.ts',
  );
  const aliased = await lintFresh(
    "import { value } from './value';\nexport { value as renamed };\n",
    'aliased-indirect.ts',
  );
  const typed = await lintFresh(
    "import type { Value } from './value';\nexport type { Value };\n",
    'typed-indirect.ts',
  );
  const defaulted = await lintFresh(
    "import value from './value';\nexport default value;\n",
    'default-indirect.ts',
  );

  for (const result of [named, aliased, typed, defaulted]) {
    expect(ruleIds(result)).toContain('ankhorage/no-forward-exports');
  }
});

it('allows declarations exported where they are defined and index barrel forward exports', async () => {
  const value = await lintFresh('export const value = 1;\n', 'owned.ts');
  const listed = await lintFresh('const value = 1;\nexport { value };\n', 'owned-listed.ts');
  const type = await lintFresh('export type Value = string;\n', 'owned-type.ts');
  const barrel = await lintFresh("export { value } from './value';\n", 'index.ts');
  const indirectBarrel = await lintFresh(
    "import { value } from './value';\nexport { value };\n",
    'nested/index.ts',
  );

  expect(ruleIds(value)).not.toContain('ankhorage/no-forward-exports');
  expect(ruleIds(listed)).not.toContain('ankhorage/no-forward-exports');
  expect(ruleIds(type)).not.toContain('ankhorage/no-forward-exports');
  expect(ruleIds(barrel)).not.toContain('ankhorage/no-forward-exports');
  expect(ruleIds(indirectBarrel)).not.toContain('ankhorage/no-forward-exports');
});

it('keeps the central TypeScript, unused-import, formatting, and restricted-import rules active', async () => {
  const workspace = await createLintWorkspace();
  const source = [
    "import 'react-native-reanimated-dnd';",
    "import { unused } from 'unused';",
    '',
    'const value:any=1;',
    'void value;',
    '',
  ].join('\n');
  const result = await workspace.lint(source, 'policy.ts');
  const rules = ruleIds(result);

  expect(rules).toContain('no-restricted-imports');
  expect(rules).toContain('unused-imports/no-unused-imports');
  expect(rules).toContain('@typescript-eslint/no-explicit-any');
  expect(rules).toContain('prettier/prettier');
});
