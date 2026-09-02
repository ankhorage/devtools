import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const temporaryDirectories: string[] = [];

/*** Remove every temporary Templates fixture created by imagery behavior tests. */
export async function cleanupTemplatesFixtures(): Promise<void> {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
}

/*** Set up the minimum released owner surface required by the packaged skill script. */
export async function createTemplatesFixture(): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-zora-imagery-');
  temporaryDirectories.push(target);
  await writeJson(join(target, 'package.json'), {
    name: '@ankhorage/templates',
    version: '9.0.0',
    type: 'module',
    exports: { '.': './index.js', './package.json': './package.json' },
  });
  await writeFile(join(target, 'index.js'), TEMPLATES_FIXTURE_SOURCE);
  await writeFixturePackage(target, '@ankhorage/zora', '4.0.0', {
    './theme': './theme.js',
    './metadata': './metadata.js',
    './package.json': './package.json',
  });
  const zoraDirectory = join(target, 'node_modules/@ankhorage/zora');
  await writeFile(join(zoraDirectory, 'theme.js'), 'export const compileZoraTheme = () => ({});\n');
  await writeFile(
    join(zoraDirectory, 'metadata.js'),
    'export const ZORA_COMPONENT_META = {}; export const ZORA_THEME_RECIPE_META = {};\n',
  );
  await mkdir(categoryPath(target), { recursive: true });
  await writeFile(join(categoryPath(target), 'index.ts'), CATEGORY_REGISTRY_SOURCE);
  return target;
}

/*** Create one complete input whose manifest is ready before imagery registration. */
export function createScaffoldInput(
  targetDirectory: string,
  templateId: string,
): Record<string, unknown> {
  return {
    targetDirectory,
    category: 'business_productivity',
    templateId,
    label: 'Evidence Board',
    description: 'A metadata-backed evidence review starter.',
    artifact: { status: 'resolved', source: { mode: 'template', inputs: [], evidence: [] } },
    manifest: createManifest(),
  };
}

/*** Write deterministic source images that the skill must retain inside the target template. */
export async function writeFixtureImages(
  target: string,
): Promise<Record<'capture' | 'concept' | 'hero', string>> {
  const concept = join(target, 'concept.png');
  const capture = join(target, 'capture.png');
  const hero = join(target, 'hero.svg');
  await Promise.all([
    writeFile(concept, 'concept-image'),
    writeFile(capture, 'runtime-capture'),
    writeFile(hero, '<svg xmlns="http://www.w3.org/2000/svg"/>'),
  ]);
  return { concept, capture, hero };
}

/*** Create one complete ordered evidence record for a durable fixture image. */
export function imageEvidence(
  id: string,
  sourcePath: string,
  contentType: string,
  width: number,
  height: number,
  mode: string,
  state: string,
  order: number,
): Record<string, unknown> {
  return {
    id,
    sourcePath,
    contentType,
    width,
    height,
    mode,
    state,
    order,
    origin: 'generated',
    provenance: { tool: 'fixture' },
  };
}

/*** Write deterministic JSON input to the temporary target repository. */
export async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/*** Return the one category registry path owned by this focused fixture. */
export function categoryPath(target: string): string {
  return join(target, 'src/templates/starter/categories/business-productivity');
}

/*** Install one minimal public ESM package fixture under the target repository. */
async function writeFixturePackage(
  target: string,
  packageName: string,
  version: string,
  exports: Record<string, string>,
): Promise<void> {
  const directory = join(target, 'node_modules', packageName);
  await mkdir(directory, { recursive: true });
  await writeJson(join(directory, 'package.json'), {
    name: packageName,
    version,
    type: 'module',
    exports,
  });
}

/*** Create the released-ready base manifest used by the owner fixture. */
function createManifest(): Record<string, unknown> {
  const theme = {
    id: 'evidence-theme',
    name: 'Evidence Theme',
    light: { primaryColor: '#2563EB', harmony: 'complementary' },
    dark: { primaryColor: '#2563EB', harmony: 'complementary' },
  };
  return {
    metadata: {
      name: 'Evidence Board',
      slug: 'evidence-board',
      version: '1.0.0',
      category: 'business_productivity',
      themeId: theme.id,
    },
    themes: [theme],
    activeThemeId: theme.id,
    infra: { modules: [] },
    navigator: { type: 'stack', routes: [{ name: 'index', screenId: 'home' }] },
    screens: {
      home: {
        id: 'home',
        name: 'Home',
        root: {
          id: 'home-root',
          type: 'View',
          children: [
            { id: 'hero-image', type: 'Image', props: { source: { mediaId: 'hero-image' } } },
          ],
        },
      },
    },
    settings: { localization: { defaultLocale: 'en', locales: ['en'] } },
  };
}

const CATEGORY_REGISTRY_SOURCE = `import type { CategoryStarterTemplateDefinition } from '../../starter.types';

export const businessProductivityStarterTemplates = [] satisfies readonly CategoryStarterTemplateDefinition[];
`;

const TEMPLATES_FIXTURE_SOURCE = `
export const CATEGORY_PRESETS = {};
export const TONE_PAIR_CATALOG = [];
export const resolveTonePair = () => null;
export const resolveCategoryDesignPreset = () => ({});
export const compileCategoryDesign = () => ({});
export const composeCategoryAppManifest = () => ({});
export const validateTemplateManifest = (manifest) => ({ manifest, diagnostics: [], status: 'ready' });
export const assertTemplateManifestReady = (composition) => composition.manifest;
export const createStarterTemplateArtifact = (manifest, assets) => ({ manifest, assets });
`;
