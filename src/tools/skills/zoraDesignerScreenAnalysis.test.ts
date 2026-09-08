import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, expect, it } from 'bun:test';
import sharp from 'sharp';

import { readCurrentDevtoolsVersion } from '../package/index.js';
import { inspectOwnerRequirements } from './assets/zora-designer/scripts/owner-api.ts';
import { syncManagedSkills } from './managed.js';
import {
  COLOR_THEORY_FIXTURE_SOURCE,
  CONTRACTS_FIXTURE_SOURCE,
  TEMPLATES_FIXTURE_SOURCE,
  ZORA_METADATA_FIXTURE_SOURCE,
  ZORA_THEME_FIXTURE_SOURCE,
} from './zoraDesignerOwnerFixtures.js';

const ANALYZE_SCREEN_SCRIPT = resolve(
  'src/tools/skills/assets/zora-designer/scripts/analyze-screen.ts',
);
const DEVTOOLS_SOURCE_ROOT = resolve(import.meta.dir, '../../..');
const OWNER_RELEASES = inspectOwnerRequirements();
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

it('derives a canonical ScreenSpec through the released local Utility image pipeline', async () => {
  const target = await createOwnerFixture();
  await linkDevtoolsSource(target);
  const inputPath = await writeScreenAnalysisInput(target, {
    id: 'home',
    name: 'Home',
    title: 'Home',
  });

  const result = await runScript([inputPath], target);
  expect(result).toMatchObject({ exitCode: 0, stderr: '' });
  const output = JSON.parse(result.stdout) as {
    componentNames: string[];
    confidence: number;
    diagnostics: { kind: string }[];
    screen: { id: string; name: string; root: { type: string } };
    unresolvedComponentName: string;
  };
  expect(output.screen).toMatchObject({ id: 'home', name: 'Home' });
  expect(output.screen.root.type).toBe('Screen');
  expect(output.componentNames).toContain('Screen');
  expect(output.unresolvedComponentName).toBe('MissingElement');
  expect(output.confidence).toBeGreaterThan(0);
  expect(Array.isArray(output.diagnostics)).toBe(true);
});

it('uses installed plugin metadata and keeps unavailable OCR supplementary', async () => {
  const target = await createOwnerFixture();
  await linkDevtoolsSource(target);
  await installTabletopPlugin(target);
  const inputPath = await writeScreenAnalysisInput(
    target,
    { id: 'table', name: 'Table' },
    { langPath: './missing-tessdata', language: 'eng' },
  );

  const result = await runScript([inputPath], target);
  expect(result.exitCode).toBe(0);
  const output = JSON.parse(result.stdout) as {
    componentNames: string[];
    diagnostics: { kind: string }[];
    owners: { plugins: Record<string, string> };
  };
  expect(output.componentNames).toContain('TabletopTable');
  expect(Object.keys(output.owners.plugins)).toContain('@ankhorage/zora-tabletop');
  expect(output.diagnostics.some((diagnostic) => diagnostic.kind === 'ocr')).toBe(true);
});

it('fails clearly when the target does not have Devtools installed', async () => {
  const target = await createOwnerFixture();
  const inputPath = await writeScreenAnalysisInput(target, { id: 'home', name: 'Home' });

  const result = await runScript([inputPath], target);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('requires the target repository to have @ankhorage/devtools');
});

it('fails clearly when installed Devtools lacks Utility image engines', async () => {
  const target = await createOwnerFixture();
  await writeFixturePackage(target, '@ankhorage/devtools', '1.0.0', {
    './package.json': './package.json',
  });
  await writeFixturePackage(target, '@ankhorage/utility', '0.5.0', {
    './image': './image.js',
    './package.json': './package.json',
  });
  await writeFile(
    join(target, 'node_modules/@ankhorage/utility/image.js'),
    'export const analyzeScreenImageAsync = async () => ({});\nexport const createTesseractScreenOcrAsync = async () => ({});\n',
  );
  const inputPath = await writeScreenAnalysisInput(target, { id: 'home', name: 'Home' });

  const result = await runScript([inputPath], target);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('bun add -D sharp @techstark/opencv-js');
});

it('fails clearly when installed Devtools does not provide Utility image analysis', async () => {
  const target = await createOwnerFixture();
  await writeFixturePackage(target, '@ankhorage/devtools', '1.0.0', {
    './package.json': './package.json',
  });
  const inputPath = await writeScreenAnalysisInput(target, { id: 'home', name: 'Home' });

  const result = await runScript([inputPath], target);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('requires @ankhorage/utility 0.5.x');
});

it('synchronizes recognition assets through managed skill ownership', async () => {
  const target = await createTarget('@ankhorage/templates');
  await syncManagedSkills(target, readCurrentDevtoolsVersion(), { dryRun: false });

  expect(
    await Bun.file(join(target, '.agents/skills/zora-designer/scripts/analyze-screen.ts')).exists(),
  ).toBe(true);
  expect(
    await Bun.file(
      join(target, '.agents/skills/zora-designer/references/screen-analysis.md'),
    ).exists(),
  ).toBe(true);
});

/*** Create a temporary target with the released owner package surfaces used by zora-designer. */
async function createOwnerFixture(): Promise<string> {
  const target = await createTarget('fixture');
  await writeFixturePackage(
    target,
    '@ankhorage/color-theory',
    OWNER_RELEASES.colorTheory.minimumVersion,
    { '.': './index.js', './package.json': './package.json' },
    COLOR_THEORY_FIXTURE_SOURCE,
  );
  await writeFixturePackage(
    target,
    '@ankhorage/contracts',
    OWNER_RELEASES.contracts.minimumVersion,
    { '.': './index.js', './package.json': './package.json' },
    CONTRACTS_FIXTURE_SOURCE,
  );
  await writeFixturePackage(
    target,
    '@ankhorage/templates',
    OWNER_RELEASES.templates.minimumVersion,
    { '.': './index.js', './package.json': './package.json' },
    TEMPLATES_FIXTURE_SOURCE,
  );
  await writeFixturePackage(target, '@ankhorage/zora', OWNER_RELEASES.zora.minimumVersion, {
    './metadata': './metadata.js',
    './package.json': './package.json',
    './theme': './theme.js',
  });
  const zoraDirectory = join(target, 'node_modules/@ankhorage/zora');
  await writeFile(join(zoraDirectory, 'metadata.js'), ZORA_METADATA_FIXTURE_SOURCE);
  await writeFile(join(zoraDirectory, 'theme.js'), ZORA_THEME_FIXTURE_SOURCE);
  return target;
}

/*** Install one metadata-only ZORA plugin fixture and declare it on the target package. */
async function installTabletopPlugin(target: string): Promise<void> {
  await writeJson(join(target, 'package.json'), {
    name: 'fixture',
    type: 'module',
    dependencies: { '@ankhorage/zora-tabletop': '^0.1.0' },
  });
  await writeFixturePackage(target, '@ankhorage/zora-tabletop', '0.1.0', {
    './metadata': './metadata.js',
    './package.json': './package.json',
  });
  await writeFile(
    join(target, 'node_modules/@ankhorage/zora-tabletop/metadata.js'),
    `export const ZORA_PLUGIN_METADATA = {
  packageName: '@ankhorage/zora-tabletop',
  componentMeta: {
    TabletopTable: {
      name: 'TabletopTable', category: 'component', directManifestNode: true,
      allowedChildren: [], props: {},
    },
  },
  placements: [{ child: 'TabletopTable', parents: ['Screen'] }],
};\n`,
  );
}

/*** Link the current Devtools package so the copied skill resolves its declared Utility dependency. */
async function linkDevtoolsSource(target: string): Promise<void> {
  const scopeDirectory = join(target, 'node_modules/@ankhorage');
  await mkdir(scopeDirectory, { recursive: true });
  await symlink(DEVTOOLS_SOURCE_ROOT, join(scopeDirectory, 'devtools'), 'dir');
}

/*** Write one screen-analysis input with a locally generated nontrivial PNG. */
async function writeScreenAnalysisInput(
  target: string,
  screen: { id: string; name: string; title?: string },
  ocr?: { langPath: string; language?: string },
): Promise<string> {
  const imagePath = await createScreenImage(target);
  const inputPath = join(target, 'screen-analysis-input.json');
  await writeJson(inputPath, {
    image: imagePath,
    screen,
    ...(ocr ? { ocr } : {}),
  });
  return inputPath;
}

/*** Generate one local PNG without relying on remote screenshot fixtures. */
async function createScreenImage(target: string): Promise<string> {
  const imagePath = join(target, 'screen.png');
  await sharp({
    create: {
      width: 120,
      height: 160,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toFile(imagePath);
  return imagePath;
}

/*** Create one isolated package root for recognition integration tests. */
async function createTarget(name: string): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-zora-screen-analysis-');
  temporaryDirectories.push(target);
  await writeJson(join(target, 'package.json'), { name, type: 'module' });
  return target;
}

/*** Write one ESM package fixture with public exports under the target's node_modules tree. */
async function writeFixturePackage(
  target: string,
  packageName: string,
  version: string,
  exports: Record<string, string>,
  indexSource = '',
): Promise<void> {
  const packageDirectory = join(target, 'node_modules', packageName);
  await mkdir(packageDirectory, { recursive: true });
  await writeJson(join(packageDirectory, 'package.json'), {
    name: packageName,
    version,
    type: 'module',
    exports,
  });
  if (indexSource !== '') await writeFile(join(packageDirectory, 'index.js'), indexSource);
}

/*** Run the distributed analyzer exactly as a consumer repository invokes it. */
async function runScript(
  arguments_: string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const process = Bun.spawn({
    cmd: ['bun', ANALYZE_SCREEN_SCRIPT, ...arguments_],
    cwd,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]);
  return { exitCode, stdout, stderr };
}

/*** Write deterministic JSON input for one portable skill invocation. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}
