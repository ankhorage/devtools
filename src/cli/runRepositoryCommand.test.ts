import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { findDevtoolsCommandByPath } from './commands.js';
import { parseRepositoryArguments, runRepositoryCommand } from './runRepositoryCommand.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

test('syncs only the selected concern and aggregate status reports drift', async () => {
  const target = await createTarget();
  const context = createContext(target);
  const workflowsSync = getRepositoryCommand(['workflows', 'sync']);
  const allStatus = getRepositoryCommand(['status']);

  expect((await runRepositoryCommand(workflowsSync, [], context)).exitCode).toBe(0);
  expect(await readFile(join(target, '.github/workflows/ci.yml'), 'utf8')).toContain(
    "bun-version: '1.3.14'",
  );
  expect(await readFile(join(target, '.github/workflows/ci.yml'), 'utf8')).toContain(
    'bunx @ankhorage/ankh doctor validate .',
  );
  expect(await Bun.file(join(target, '.vscode/settings.json')).exists()).toBe(false);

  context.stdout.length = 0;
  expect((await runRepositoryCommand(allStatus, [], context)).exitCode).toBe(1);
  expect(context.stdout.join('')).toContain('package.json missing');
  expect(context.stdout.join('')).toContain('.vscode/settings.json missing');
  expect(context.stderr).toEqual([]);
});

test('syncs configs and merge-updates package.json without replacing unrelated fields', async () => {
  const target = await createTarget();
  await writeFile(
    join(target, 'package.json'),
    `${JSON.stringify({ name: 'fixture', type: 'module', scripts: { test: 'bun test' } }, null, 2)}\n`,
  );
  const context = createContext(target);
  const sync = getRepositoryCommand(['sync']);

  expect((await runRepositoryCommand(sync, [], context)).exitCode).toBe(0);
  const packageJson = JSON.parse(await readFile(join(target, 'package.json'), 'utf8')) as unknown;
  expect(readNestedValue(packageJson, 'scripts', 'test')).toBe('bun test');
  expect(readNestedValue(packageJson, 'scripts', 'lint')).toBe(
    'ankhorage-eslint . --max-warnings=0',
  );
  expect(readNestedValue(packageJson, 'devDependencies', '@ankhorage/devtools')).toMatch(
    /^\^\d+\.\d+\.\d+$/u,
  );
  expect(readNestedValue(packageJson, 'devDependencies', '@types/bun')).toBe('^1.3.14');
  expect(readProperty(packageJson, 'packageManager')).toBe('bun@1.3.14');
  expect(context.dependencySyncs).toBe(1);
  expect(context.dependencySyncObservedManagedFiles).toBe(true);
  expect(await readFile(join(target, 'eslint.config.mjs'), 'utf8')).toContain('createConfig');
  expect(await readFile(join(target, '.prettierrc.js'), 'utf8')).toContain('localConfig.overrides');
  expect(await readFile(join(target, 'prettier.local.config.js'), 'utf8')).toBe(
    'export default {};\n',
  );
  expect(await readFile(join(target, 'knip.config.ts'), 'utf8')).toContain('createKnipConfig');
});

test('preserves create-only local extensions across repeated synchronization', async () => {
  const target = await createTarget();
  await writeFile(join(target, 'package.json'), '{"name":"fixture","type":"module"}\n');
  const context = createContext(target);
  const sync = getRepositoryCommand(['sync']);
  const localConfig = `export default [
  {
    files: ['src/legacy.ts'],
    rules: { 'max-lines-per-function': ['error', { max: 150 }] },
  },
];
`;
  const localPrettierConfig = `export default {
  overrides: [{ files: '**/*.json', options: { printWidth: 1 } }],
};
`;

  await runRepositoryCommand(sync, [], context);
  await writeFile(join(target, 'eslint.local.config.mjs'), localConfig);
  await writeFile(join(target, 'prettier.local.config.js'), localPrettierConfig);
  await writeFile(join(target, 'knip.config.ts'), "export default { entry: ['custom.ts'] };\n");
  await runRepositoryCommand(sync, [], context);

  expect(await readFile(join(target, 'eslint.local.config.mjs'), 'utf8')).toBe(localConfig);
  expect(await readFile(join(target, 'prettier.local.config.js'), 'utf8')).toBe(
    localPrettierConfig,
  );
  expect(await readFile(join(target, 'knip.config.ts'), 'utf8')).toContain("'custom.ts'");
  expect(context.dependencySyncs).toBe(1);
});

test('preserves an existing Prettier config during first synchronization', async () => {
  const target = await createTarget();
  await writeFile(join(target, 'package.json'), '{"name":"fixture","type":"module"}\n');
  const existingConfig = `export default {
  overrides: [{ files: '**/*.yaml', options: { singleQuote: false } }],
};
`;
  await writeFile(join(target, '.prettierrc.js'), existingConfig);
  const context = createContext(target);
  const sync = getRepositoryCommand(['prettier', 'sync']);

  expect((await runRepositoryCommand(sync, [], context)).exitCode).toBe(0);
  expect(await readFile(join(target, 'prettier.local.config.js'), 'utf8')).toBe(existingConfig);
  expect(await readFile(join(target, '.prettierrc.js'), 'utf8')).toContain('localConfig.overrides');
});

test('migrates former shared-only Prettier wrappers to empty local configs', async () => {
  const fixtures = [
    {
      packageJson: '{"name":"fixture","type":"module"}\n',
      wrapper: "export { default } from '@ankhorage/devtools/prettier';\n",
      expectedLocalConfig: 'export default {};\n',
    },
    {
      packageJson: '{"name":"fixture"}\n',
      wrapper: "module.exports = require('@ankhorage/devtools/prettier');\n",
      expectedLocalConfig: 'module.exports = {};\n',
    },
  ] as const;

  for (const fixture of fixtures) {
    const target = await createTarget();
    await writeFile(join(target, 'package.json'), fixture.packageJson);
    await writeFile(join(target, '.prettierrc.js'), fixture.wrapper);
    const context = createContext(target);

    expect(
      (await runRepositoryCommand(getRepositoryCommand(['prettier', 'sync']), [], context))
        .exitCode,
    ).toBe(0);
    expect(await readFile(join(target, 'prettier.local.config.js'), 'utf8')).toBe(
      fixture.expectedLocalConfig,
    );
    expect(await readFile(join(target, '.prettierrc.js'), 'utf8')).toContain(
      'localConfig.overrides',
    );
  }
});

test('preserves an existing ESLint config during first synchronization', async () => {
  const target = await createTarget();
  await writeFile(join(target, 'package.json'), '{"name":"fixture","type":"module"}\n');
  const existingConfig = "export default [{ rules: { 'no-alert': 'error' } }];\n";
  await writeFile(join(target, 'eslint.config.mjs'), existingConfig);
  const context = createContext(target);
  const sync = getRepositoryCommand(['eslint', 'sync']);

  expect((await runRepositoryCommand(sync, [], context)).exitCode).toBe(0);
  expect(await readFile(join(target, 'eslint.local.config.mjs'), 'utf8')).toBe(existingConfig);
  expect(await readFile(join(target, 'eslint.config.mjs'), 'utf8')).toContain('createConfig');
});

test('supports dry-run and validates arguments', async () => {
  const target = await createTarget();
  const context = createContext(target);
  const sync = getRepositoryCommand(['sync']);

  expect((await runRepositoryCommand(sync, ['--dry-run'], context)).exitCode).toBe(0);
  expect(context.stdout.join('')).toContain('package.json would create');
  expect(context.stdout.join('')).toContain('bun.lock would create');
  expect(await Bun.file(join(target, 'package.json')).exists()).toBe(false);
  expect(await Bun.file(join(target, '.github/workflows/ci.yml')).exists()).toBe(false);
  expect(context.dependencySyncs).toBe(0);
  expect(() => parseRepositoryArguments(['--dry-run'], false)).toThrow(
    '--dry-run is only valid for sync commands.',
  );
  expect(() => parseRepositoryArguments(['one', 'two'], true)).toThrow(
    'Only one target path may be provided.',
  );
});

function getRepositoryCommand(path: readonly string[]) {
  const command = findDevtoolsCommandByPath(path);
  if (command?.kind !== 'repository') {
    throw new Error(`Expected repository command: ${path.join(' ')}`);
  }
  return command;
}

async function createTarget(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-repository-command-');
  temporaryDirectories.push(target);
  return target;
}

function createContext(target: string) {
  const state = { dependencySyncObservedManagedFiles: false, dependencySyncs: 0 };
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    cwd: target,
    stdout,
    stderr,
    get dependencySyncs() {
      return state.dependencySyncs;
    },
    get dependencySyncObservedManagedFiles() {
      return state.dependencySyncObservedManagedFiles;
    },
    syncDependencies: async () => {
      state.dependencySyncs += 1;
      state.dependencySyncObservedManagedFiles = (
        await Promise.all([
          Bun.file(join(target, 'eslint.config.mjs')).exists(),
          Bun.file(join(target, 'prettier.local.config.js')).exists(),
          Bun.file(join(target, '.vscode/settings.json')).exists(),
          Bun.file(join(target, '.github/workflows/ci.yml')).exists(),
        ])
      ).every(Boolean);
      return { relativePath: 'bun.lock', action: 'created' as const };
    },
    writeStdout: (text: string) => stdout.push(text),
    writeStderr: (text: string) => stderr.push(text),
  };
}

function readNestedValue(value: unknown, property: string, nestedProperty: string): unknown {
  if (!isRecord(value)) {
    return undefined;
  }
  const nested = value[property];
  return isRecord(nested) ? nested[nestedProperty] : undefined;
}

function readProperty(value: unknown, property: string): unknown {
  return isRecord(value) ? value[property] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
