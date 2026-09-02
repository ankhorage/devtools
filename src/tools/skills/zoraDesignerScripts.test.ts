import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'bun:test';

const OWNER_SCRIPT = resolve('src/tools/skills/assets/zora-designer/scripts/owner-api.mjs');
const AUDIT_SCRIPT = resolve('src/tools/skills/assets/zora-designer/scripts/audit.mjs');
const SCAFFOLD_SCRIPT = resolve(
  'src/tools/skills/assets/zora-designer/scripts/scaffold-template.mjs',
);
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe('zora-designer owner API orchestration', () => {
  it('reports actionable missing and outdated released-owner diagnostics', async () => {
    const missingTarget = await createTarget('fixture');
    const missing = await runScript(OWNER_SCRIPT, ['inspect'], missingTarget);
    expect(missing.exitCode).toBe(1);
    expect(missing.stderr).toContain('requires @ankhorage/templates >=');
    expect(missing.stderr).toContain('normal Renovate/release workflow');

    const outdatedTarget = await createOwnerFixture('7.9.0');
    const outdated = await runScript(OWNER_SCRIPT, ['inspect'], outdatedTarget);
    expect(outdated.exitCode).toBe(1);
    expect(outdated.stderr).toContain('is outdated');
  });

  it('composes owner themes and emits MissingElement only for an unresolved semantic region', async () => {
    const target = await createOwnerFixture();
    const inputPath = join(target, 'design-input.json');
    await writeJson(inputPath, {
      category: 'business_productivity',
      name: 'Evidence Board',
      slug: 'evidence-board',
      theme: { recipes: { components: { Card: { variant: 'outlined' } } } },
      navigator: {
        type: 'stack',
        initialRouteName: 'index',
        routes: [{ name: 'index', screenId: 'home' }],
      },
      screens: {
        home: { id: 'home', name: 'Home', root: { id: 'home-root', type: 'View', children: [] } },
      },
      regions: [
        {
          id: 'title',
          screenId: 'home',
          requestedCapability: 'Screen heading',
          component: 'Text',
          props: { text: 'Evidence Board' },
          evidenceId: 'image-1:title',
        },
        {
          id: 'unsupported-map',
          screenId: 'home',
          requestedCapability: 'Interactive evidence map',
          evidenceId: 'image-1:map',
          ownerIssueUrl: 'https://github.com/ankhorage/zora/issues/999',
        },
      ],
      authoringState: 'release',
    });

    const result = await runScript(OWNER_SCRIPT, ['compose', inputPath], target);
    expect(result.exitCode).toBe(0);
    const output = JSON.parse(result.stdout) as {
      applicationGate: string;
      requestedAuthoringState: string;
      composition: { authoringState: string; manifest: { screens: Record<string, Screen> } };
      blockers: { ownerIssueUrl: string }[];
      computedTheme: { light: { surfaceTheme: object }; dark: { surfaceTheme: object } };
    };
    const children = output.composition.manifest.screens.home.root.children ?? [];
    expect(children.map((node) => node.type)).toEqual(['Text', 'MissingElement']);
    expect(output.applicationGate).toBe('blocked');
    expect(output.requestedAuthoringState).toBe('release');
    expect(output.composition.authoringState).toBe('draft');
    expect(output.blockers[0]?.ownerIssueUrl).toContain('/zora/issues/');
    expect(output.computedTheme.light.surfaceTheme).toBeDefined();
    expect(output.computedTheme.dark.surfaceTheme).toBeDefined();
  });
});

describe('zora-designer owner repository discovery', () => {
  it('uses the current package public export when the target is the owner repository', async () => {
    const target = await createOwnerFixture();
    await writeJson(join(target, 'package.json'), {
      name: '@ankhorage/templates',
      version: '8.0.0',
      type: 'module',
      exports: { '.': './index.js', './package.json': './package.json' },
    });
    await writeFile(join(target, 'index.js'), TEMPLATES_FIXTURE_SOURCE);

    const result = await runScript(OWNER_SCRIPT, ['inspect'], target);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"templates": "8.0.0"');
  });
});

describe('zora-designer evidence and artifact calculation', () => {
  it('keeps URL/image-series evidence limits and serializes deterministic weighted results', async () => {
    const target = await createTarget('fixture');
    const inputPath = join(target, 'audit-input.json');
    const outputA = join(target, 'zora-designer-a.md');
    const outputB = join(target, 'zora-designer-b.md');
    const evidence = [
      createEvidence('url-runtime', 'url', 'high', 1, 'Keyboard focus was captured in-browser.'),
      createEvidence('image-1', 'image', 'medium', 0.67, 'First ordered screen image.'),
      createEvidence('image-2', 'image', 'medium', 0.67, 'Second ordered screen image.'),
    ];
    await writeJson(inputPath, {
      status: 'audited',
      source: {
        mode: 'audit',
        inputs: ['https://example.test', 'screen-1.png', 'screen-2.png'],
        evidence,
      },
      userNotes: 'Preserve this note exactly.',
      auditInput: {
        evidence,
        criteria: {
          R01: {
            'purpose-and-primary-task': assessedCriterion('pass', ['image-1']),
          },
          R06: {
            'normal-and-large-text': assessedCriterion('major', ['image-1', 'image-2']),
          },
        },
        releaseGates: {
          RG07: {
            criteria: {
              'owner-diagnostics-pass': {
                applicable: true,
                status: 'fail',
                evidenceIds: ['url-runtime'],
                reason: 'The captured owner diagnostic blocks runtime application.',
              },
            },
          },
        },
        findings: [
          {
            id: 'ZD-R06-001',
            rule: 'R06',
            criterionId: 'normal-and-large-text',
            severity: 'major',
            location: 'screen-1/body-copy',
            evidence: 'Muted body text is visibly weak in both ordered images.',
            evidenceIds: ['image-1', 'image-2'],
            evidenceLevel: 'observed',
            expected: 'Body text must meet measured contrast requirements.',
            impact: 'Readers may be unable to distinguish essential content.',
            rootCause: 'muted-text-token',
            relatedRules: ['R17'],
            fix: 'Correct the shared muted text token in the owning theme pipeline.',
            verification: 'Measure the computed pair in both modes and recapture both screens.',
            confidence: 'medium',
          },
        ],
      },
    });

    expect((await runScript(AUDIT_SCRIPT, ['audit', inputPath, outputA], target)).exitCode).toBe(0);
    expect((await runScript(AUDIT_SCRIPT, ['audit', inputPath, outputB], target)).exitCode).toBe(0);
    const artifact = await readFile(outputA, 'utf8');
    expect(await readFile(outputB, 'utf8')).toBe(artifact);
    expect(artifact).toContain('"score": 65');
    expect(artifact).toContain('"coverage": 4');
    expect(artifact).toContain('"scoreImpact": 1.5');
    expect(artifact).toContain('"releaseGate": "fail"');
    expect(artifact).toContain('First ordered screen image.');
    expect(artifact).toContain('Second ordered screen image.');
    expect(artifact).toContain('Preserve this note exactly.');
  });
});

describe('zora-designer Templates scaffolding', () => {
  it('validates a ready manifest and writes the normal variant and category registry source', async () => {
    const target = await createOwnerFixture();
    await writeJson(join(target, 'package.json'), {
      name: '@ankhorage/templates',
      version: '8.0.0',
      type: 'module',
      exports: { '.': './index.js', './package.json': './package.json' },
    });
    await writeFile(join(target, 'index.js'), TEMPLATES_FIXTURE_SOURCE);
    const categoryDirectory = join(
      target,
      'src/templates/starter/categories/business-productivity',
    );
    await mkdir(categoryDirectory, { recursive: true });
    await writeFile(
      join(categoryDirectory, 'index.ts'),
      `import type { CategoryStarterTemplateDefinition } from '../../starter.types';
import { createDefaultStarterTemplate } from './default.template';

export const businessProductivityStarterTemplates = [
  {
    id: 'default',
    label: 'Default',
    description: 'Default starter.',
    create: createDefaultStarterTemplate,
  },
] satisfies readonly CategoryStarterTemplateDefinition[];
`,
    );
    const scaffoldInput = join(target, 'scaffold-input.json');
    await writeJson(scaffoldInput, {
      targetDirectory: target,
      category: 'business_productivity',
      templateId: 'evidence-board',
      label: 'Evidence Board',
      description: 'A metadata-backed evidence review starter.',
      manifest: createManifest(),
    });

    const result = await runScript(SCAFFOLD_SCRIPT, [scaffoldInput], target);
    expect(result.exitCode).toBe(0);
    const variantDirectory = join(categoryDirectory, 'evidence-board');
    expect(await readFile(join(variantDirectory, 'index.ts'), 'utf8')).toContain(
      'createEvidenceBoardStarterTemplate',
    );
    expect(await readFile(join(variantDirectory, 'manifest.ts'), 'utf8')).toContain(
      'AUTHORED_EVIDENCE_BOARD_MANIFEST',
    );
    expect(await readFile(join(variantDirectory, 'template.ts'), 'utf8')).toContain(
      'seed.theme ??',
    );
    const registry = await readFile(join(categoryDirectory, 'index.ts'), 'utf8');
    expect(registry).toContain("from './evidence-board'");
    expect(registry).toContain("id: 'evidence-board'");
    expect((await runScript(SCAFFOLD_SCRIPT, [scaffoldInput], target)).exitCode).toBe(1);
  });
});

interface ScreenNode {
  children?: ScreenNode[];
  id: string;
  type: string;
}

interface Screen {
  root: ScreenNode;
}

/*** Create one temporary package root for portable script tests. */
async function createTarget(name: string): Promise<string> {
  const target = await mkdtemp('/tmp/devtools-zora-designer-');
  temporaryDirectories.push(target);
  await writeJson(join(target, 'package.json'), { name, type: 'module' });
  return target;
}

/*** Create released-owner package fixtures with the exact public subpaths used by the skill. */
async function createOwnerFixture(templatesVersion = '8.0.0'): Promise<string> {
  const target = await createTarget('fixture');
  await writeFixturePackage(
    target,
    '@ankhorage/templates',
    templatesVersion,
    {
      '.': './index.js',
      './package.json': './package.json',
    },
    TEMPLATES_FIXTURE_SOURCE,
  );
  await writeFixturePackage(target, '@ankhorage/zora', '4.0.0', {
    './theme': './theme.js',
    './metadata': './metadata.js',
    './package.json': './package.json',
  });
  const zoraDirectory = join(target, 'node_modules/@ankhorage/zora');
  await writeFile(join(zoraDirectory, 'theme.js'), ZORA_THEME_FIXTURE_SOURCE);
  await writeFile(join(zoraDirectory, 'metadata.js'), ZORA_METADATA_FIXTURE_SOURCE);
  return target;
}

/*** Write one ESM package fixture under the target's node_modules tree. */
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

/*** Run one packaged skill script and collect stable text output. */
async function runScript(
  script: string,
  arguments_: string[],
  cwd: string,
): Promise<{ exitCode: number; stderr: string; stdout: string }> {
  const process = Bun.spawn({
    cmd: ['bun', script, ...arguments_],
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

/*** Write deterministic JSON test input. */
async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/*** Create one complete evidence record with an explicit confidence factor. */
function createEvidence(
  id: string,
  kind: string,
  confidence: string,
  confidenceFactor: number,
  observation: string,
): Record<string, unknown> {
  return {
    id,
    kind,
    location: id,
    observation,
    evidenceLevel: kind === 'url' ? 'measured' : 'observed',
    confidence,
    confidenceFactor,
    reproduction: `Open ${id}`,
    limitations: kind === 'url' ? [] : ['Invisible behavior is not assessable.'],
  };
}

/*** Create one assessed criterion that derives confidence from essential evidence. */
function assessedCriterion(status: string, evidenceIds: string[]): Record<string, unknown> {
  return {
    applicable: true,
    status,
    evidenceIds,
    essentialEvidenceIds: evidenceIds,
    reason: 'Supported by the referenced evidence.',
  };
}

/*** Create a minimal canonical manifest accepted by the released-owner fixture. */
function createManifest(): Record<string, unknown> {
  return {
    metadata: {
      name: 'Evidence Board',
      slug: 'evidence-board',
      version: '1.0.0',
      category: 'business_productivity',
      themeId: 'evidence-theme',
    },
    themes: [createThemeConfig()],
    activeThemeId: 'evidence-theme',
    infra: { modules: [] },
    navigator: { type: 'stack', routes: [{ name: 'index', screenId: 'home' }] },
    screens: {
      home: { id: 'home', name: 'Home', root: { id: 'home-root', type: 'View' } },
    },
    settings: { localization: { defaultLocale: 'en', locales: ['en'] } },
  };
}

/*** Create the compact theme configuration returned by the owner fixture. */
function createThemeConfig(): Record<string, unknown> {
  return {
    id: 'evidence-theme',
    name: 'Evidence Theme',
    light: { primaryColor: '#2563EB', harmony: 'complementary' },
    dark: { primaryColor: '#2563EB', harmony: 'complementary' },
  };
}

const TEMPLATES_FIXTURE_SOURCE = `
export const CATEGORY_PRESETS = {
  business_productivity: {
    category: 'business_productivity',
    label: 'Business',
    recommendedPrimaryColors: ['#2563EB'],
    recommendedHarmonies: ['complementary'],
    tonePairs: { light: 'jewel-on-neutral-light', dark: 'pastel-on-neutral-dark' },
  },
};
export const TONE_PAIR_CATALOG = [];
export const resolveTonePair = () => null;
export const resolveCategoryDesignPreset = (category, theme = {}) => ({ category, theme });
const themeConfig = ${JSON.stringify(createThemeConfig())};
export const compileCategoryDesign = (category) => ({
  category,
  themeConfig,
  diagnostics: [],
  computedTheme: {
    themeConfig,
    light: { surfaceTheme: { mode: 'light' }, diagnostics: [] },
    dark: { surfaceTheme: { mode: 'dark' }, diagnostics: [] },
    diagnostics: [],
  },
});
export const composeCategoryAppManifest = (input) => ({
  manifest: {
    metadata: {
      name: input.name ?? 'Generated App',
      slug: input.slug ?? 'generated-app',
      version: input.version ?? '1.0.0',
      category: input.category,
      themeId: 'evidence-theme',
    },
    themes: [themeConfig],
    activeThemeId: 'evidence-theme',
    infra: { modules: input.modules ?? [] },
    navigator: input.navigator,
    screens: input.screens,
    settings: { localization: { defaultLocale: 'en', locales: ['en'] } },
  },
  diagnostics: [],
  status: input.authoringState === 'release' ? 'ready' : 'blocked',
  authoringState: input.authoringState,
});
export const validateTemplateManifest = (manifest) => ({
  manifest,
  diagnostics: [],
  status: 'ready',
  authoringState: 'release',
});
export const assertTemplateManifestReady = (composition) => composition.manifest;
`;

const ZORA_THEME_FIXTURE_SOURCE = `
export const compileZoraTheme = (themeConfig) => ({
  themeConfig,
  light: { surfaceTheme: { mode: 'light' }, diagnostics: [] },
  dark: { surfaceTheme: { mode: 'dark' }, diagnostics: [] },
  diagnostics: [],
});
`;

const ZORA_METADATA_FIXTURE_SOURCE = `
export const ZORA_COMPONENT_META = {
  View: { name: 'View', directManifestNode: true, allowedChildren: ['Text', 'MissingElement'], props: {} },
  Text: { name: 'Text', directManifestNode: true, allowedChildren: [], props: { text: { type: 'string' } } },
  MissingElement: {
    name: 'MissingElement',
    directManifestNode: true,
    allowedChildren: [],
    manifestPolicy: { kind: 'unresolved-element', availability: 'draft-only', releaseGate: 'blocked' },
    blueprint: { defaultProps: { requestedCapability: 'Unresolved', reason: 'No exact element.' } },
    props: {
      requestedCapability: { type: 'string' },
      reason: { type: 'string' },
      evidenceId: { type: 'string' },
    },
  },
};
export const ZORA_THEME_RECIPE_META = {
  Card: {
    name: 'Card',
    kind: 'component',
    fields: { variant: { type: 'choice', options: ['filled', 'outlined'] } },
  },
};
`;
