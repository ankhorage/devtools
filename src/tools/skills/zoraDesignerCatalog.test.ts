import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

import { inspectOwnerRequirements } from './assets/zora-designer/scripts/owner-api.ts';

const CATALOG_SCRIPT = resolve(
  'src/tools/skills/assets/zora-designer/scripts/generate-template-catalog.ts',
);
const OWNER_RELEASES = inspectOwnerRequirements();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('zora-designer template catalog', () => {
  it('generates discovery before the Templates owner package has been built', async () => {
    const target = await mkdtemp('/tmp/devtools-zora-catalog-');
    temporaryDirectories.push(target);
    await writeJson(join(target, 'package.json'), {
      name: '@ankhorage/templates',
      version: OWNER_RELEASES.templates.minimumVersion,
      type: 'module',
      exports: { '.': './dist/index.js', './package.json': './package.json' },
    });
    await writeFixturePackage(target, '@ankhorage/contracts', {
      APP_CATEGORIES: ['business_productivity'],
      NAVIGATOR_TYPES: ['stack', 'tabs', 'drawer'],
    });
    await mkdir(join(target, 'src/templates/categories/business-productivity'), {
      recursive: true,
    });
    await writeFile(
      join(target, 'src/templates/catalog.ts'),
      'export interface TemplateDefinition {}\n',
    );

    const child = Bun.spawn([process.execPath, CATALOG_SCRIPT, target], {
      cwd: target,
      stderr: 'pipe',
      stdout: 'pipe',
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    expect({ exitCode, stderr }).toEqual({ exitCode: 0, stderr: '' });
    expect(await readFile(join(target, 'src/templates/catalog.generated.ts'), 'utf8')).toContain(
      'readonly TemplateDefinition[] = [];',
    );
  });
});

/*** Write a minimal installed package fixture with one JavaScript public export. */
async function writeFixturePackage(
  target: string,
  packageName: string,
  exports: Record<string, unknown>,
): Promise<void> {
  const root = join(target, 'node_modules', ...packageName.split('/'));
  await mkdir(root, { recursive: true });
  await writeJson(join(root, 'package.json'), {
    name: packageName,
    version: OWNER_RELEASES.contracts.minimumVersion,
    type: 'module',
    exports: { '.': './index.js', './package.json': './package.json' },
  });
  await writeFile(
    join(root, 'index.js'),
    Object.entries(exports)
      .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
      .join('\n'),
  );
}

/*** Write formatted fixture JSON. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
