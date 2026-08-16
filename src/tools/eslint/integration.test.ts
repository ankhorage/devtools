import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { expect, it } from 'bun:test';
import { ESLint } from 'eslint';

import { createConfig } from './index.js';

type LintResult = Awaited<ReturnType<ESLint['lintFiles']>>[number];

interface LintWorkspace {
  readonly root: string;
  lint(code: string, fileName: string, fix?: boolean): Promise<LintResult>;
}

async function createLintWorkspace(): Promise<LintWorkspace> {
  const root = await mkdtemp(path.join(tmpdir(), 'ankhorage-eslint-'));
  await writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true }, include: ['**/*.ts'] }),
  );

  return {
    root,
    async lint(code, fileName, fix = false) {
      const filePath = path.join(root, fileName);
      await writeFile(filePath, code);
      const eslint = new ESLint({
        cwd: root,
        fix,
        overrideConfigFile: true,
        overrideConfig: createConfig({
          tsconfigRootDir: root,
          project: ['./tsconfig.json'],
          files: ['**/*.ts'],
          profile: 'base',
        }),
      });
      const [result] = await eslint.lintFiles([filePath]);
      return result;
    },
  };
}

function ruleIds(result: LintResult): string[] {
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

it('keeps export sorting active inside index barrels', async () => {
  const workspace = await createLintWorkspace();
  const source = "export { z } from './z';\nexport { a } from './a';\n";
  const result = await workspace.lint(source, 'index.ts');
  expect(ruleIds(result)).toContain('simple-import-sort/exports');
  expect(ruleIds(result)).not.toContain('no-restricted-syntax');
});

it('rejects named, type, and star forward exports outside index barrels', async () => {
  const workspace = await createLintWorkspace();
  const named = await workspace.lint("export { value } from './value';\n", 'named.ts');
  const typed = await workspace.lint("export type { Value } from './value';\n", 'typed.ts');
  const star = await workspace.lint("export * from './value';\n", 'star.ts');

  expect(ruleIds(named)).toContain('no-restricted-syntax');
  expect(ruleIds(typed)).toContain('no-restricted-syntax');
  expect(ruleIds(star)).toContain('no-restricted-syntax');
});

it('allows declarations exported where they are defined and index barrel forward exports', async () => {
  const workspace = await createLintWorkspace();
  const value = await workspace.lint('export const value = 1;\n', 'owned.ts');
  const type = await workspace.lint('export type Value = string;\n', 'owned-type.ts');
  const barrel = await workspace.lint("export { value } from './value';\n", 'index.ts');

  expect(ruleIds(value)).not.toContain('no-restricted-syntax');
  expect(ruleIds(type)).not.toContain('no-restricted-syntax');
  expect(ruleIds(barrel)).not.toContain('no-restricted-syntax');
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
