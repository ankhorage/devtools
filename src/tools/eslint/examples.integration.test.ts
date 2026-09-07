import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, expect, test } from 'bun:test';
import { ESLint } from 'eslint';

import { syncManagedFiles } from '../shared/managedFiles.js';
import { eslintManagedFiles } from './managed.js';

const targets: string[] = [];
const INVALID_EXAMPLE = 'export const value: any = 1;\nPromise.resolve(1);\n';

afterEach(async () => {
  await Promise.all(
    targets.splice(0).map((target) => rm(target, { recursive: true, force: true })),
  );
});

test('lints an example directory included only by the root tsconfig.eslint.json', async () => {
  const target = await createTargetAsync();
  await writeProjectAsync(target, 'tsconfig.json', ['src/**/*.ts']);
  await writeProjectAsync(target, 'tsconfig.eslint.json', ['examples/**/*.ts']);
  await writeFile(join(target, 'examples/basic-usage/main.ts'), INVALID_EXAMPLE);
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });

  await expectTypeCheckedLintAsync(target, 'examples/basic-usage/main.ts');
});

test('lints an example directory when only the root standard TypeScript project exists', async () => {
  const target = await createTargetAsync();
  await writeProjectAsync(target, 'tsconfig.json', ['examples/**/*.ts']);
  await writeFile(join(target, 'examples/basic-usage/main.ts'), INVALID_EXAMPLE);
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });

  await expectTypeCheckedLintAsync(target, 'examples/basic-usage/main.ts');
});

test('lints standalone nested examples without a root ESLint TypeScript project', async () => {
  const target = await createTargetAsync();
  await mkdir(join(target, 'examples/group/app'), { recursive: true });
  await writeProjectAsync(target, 'examples/group/app/tsconfig.json', ['*.ts']);
  await writeFile(join(target, 'examples/group/app/main.ts'), INVALID_EXAMPLE);
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });

  await expectTypeCheckedLintAsync(target, 'examples/group/app/main.ts');
});

test('requires explicit override adoption and preserves local rules across subsequent syncs', async () => {
  const target = await createTargetAsync();
  await writeProjectAsync(target, 'tsconfig.eslint.json', ['examples/**/*.tsx']);
  const oldConfig = `export default [{ files: ['examples/**/*.tsx'], rules: {
    'react-native/no-inline-styles': 'off',
    'max-lines-per-function': ['error', { max: 600 }],
    'max-lines': ['error', { max: 728 }],
    complexity: ['error', { max: 31 }],
  } }];\n`;
  const localConfig = 'export default [];\n';
  const configPath = join(target, 'eslint.examples.config.mjs');
  const localPath = join(target, 'eslint.local.config.mjs');
  await writeFile(configPath, oldConfig);
  await writeFile(localPath, localConfig);
  for (const dryRun of [true, false]) {
    const result = await syncManagedFiles(target, eslintManagedFiles, { dryRun }).catch(
      (error: unknown) => error,
    );
    expect(result instanceof Error && result.message).toContain(
      'Move its repository-specific overrides into eslint.local.config.mjs',
    );
    expect(await readFile(configPath, 'utf8')).toBe(oldConfig);
    expect(await readFile(localPath, 'utf8')).toBe(localConfig);
  }
  await writeFile(localPath, oldConfig);
  await rm(configPath);
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  await syncManagedFiles(target, eslintManagedFiles, { dryRun: false });
  expect(await readFile(localPath, 'utf8')).toBe(oldConfig);
  const eslint = createEslint(target);
  const config: unknown = await eslint.calculateConfigForFile('examples/basic-usage/main.tsx');
  expect(config).toMatchObject({
    rules: {
      'react-native/no-inline-styles': [0],
      'max-lines-per-function': [2, { max: 600 }],
      'max-lines': [2, { max: 728 }],
      complexity: [2, { max: 31 }],
    },
  });
});

/*** Create a consumer with access to the built package through its public export. */
async function createTargetAsync(): Promise<string> {
  const target = await realpath(await mkdtemp('/tmp/devtools-examples-integration-'));
  targets.push(target);
  await mkdir(join(target, 'examples/basic-usage'), { recursive: true });
  await mkdir(join(target, 'node_modules/@ankhorage'), { recursive: true });
  await symlink(
    resolve(import.meta.dir, '../../..'),
    join(target, 'node_modules/@ankhorage/devtools'),
  );
  await writeFile(join(target, 'package.json'), '{"name":"examples-consumer","type":"module"}\n');
  return target;
}

/*** Write the consumer-owned TypeScript project used by an example. */
async function writeProjectAsync(target: string, path: string, include: string[]): Promise<void> {
  await writeFile(
    join(target, path),
    JSON.stringify({ compilerOptions: { strict: true }, include }),
  );
}

/*** Execute the generated wrapper and require a real rule violation instead of a parser failure. */
async function expectTypeCheckedLintAsync(target: string, path: string): Promise<void> {
  const [result] = await createEslint(target).lintFiles([path]);
  expect(result.messages.filter((message) => message.fatal)).toEqual([]);
  expect(result.messages.map((message) => message.ruleId)).toContain(
    '@typescript-eslint/no-explicit-any',
  );
  expect(result.messages.map((message) => message.ruleId)).toContain(
    '@typescript-eslint/no-floating-promises',
  );
}

/*** Load the managed wrapper as a consumer would through the ESLint CLI. */
function createEslint(target: string): ESLint {
  return new ESLint({
    cwd: target,
    overrideConfigFile: join(target, 'eslint.examples.config.mjs'),
  });
}
