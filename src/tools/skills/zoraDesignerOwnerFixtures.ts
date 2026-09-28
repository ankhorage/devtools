export function createThemeConfig(): Record<string, unknown> {
  return {
    id: 'evidence-theme',
    name: 'Evidence Theme',
    light: { primaryColor: '#2563EB', harmony: 'complementary' },
    dark: { primaryColor: '#2563EB', harmony: 'complementary' },
  };
}

export const TEMPLATES_FIXTURE_SOURCE = `
export const CATEGORY_PRESETS = {
  business_productivity: {
    category: 'business_productivity',
    label: 'Business',
    recommendedPrimaryColors: ['#2563EB'],
    recommendedHarmonies: ['complementary'],
    tonePairs: { light: 'jewel-on-neutral-light', dark: 'pastel-on-neutral-dark' },
    density: 'compact',
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
    themes: { 'evidence-theme': themeConfig },
    activeThemeId: 'evidence-theme',
    infra: { modules: input.modules ?? {} },
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

export const COLOR_THEORY_FIXTURE_SOURCE = `
export const COLOR_HARMONIES = ['monochromatic', 'complementary'];
export const COLOR_HARMONY_CATALOG = [
  { id: 'monochromatic', label: 'Monochromatic', description: 'One hue.' },
  { id: 'complementary', label: 'Complementary', description: 'Opposing hues.' },
];
`;

export const CONTRACTS_FIXTURE_SOURCE = `
export const APP_CATEGORIES = ['business_productivity'];
export const NAVIGATOR_TYPES = ['stack', 'tabs', 'drawer'];
`;

export const ZORA_THEME_FIXTURE_SOURCE = `
export const compileZoraTheme = (themeConfig) => ({
  themeConfig,
  light: { surfaceTheme: { mode: 'light' }, diagnostics: [] },
  dark: { surfaceTheme: { mode: 'dark' }, diagnostics: [] },
  diagnostics: [],
});
`;

export const ZORA_METADATA_FIXTURE_SOURCE = `
export const ZORA_COMPONENT_META = {
  Screen: {
    name: 'Screen',
    category: 'layout',
    description: 'Screen layout root',
    directManifestNode: true,
    allowedChildren: ['View', 'Box', 'Text', 'MissingElement', 'TabletopTable'],
    props: {},
  },
  View: {
    name: 'View',
    category: 'layout',
    directManifestNode: true,
    allowedChildren: ['Text', 'Box', 'TabletopTable'],
    props: {},
  },
  Box: {
    name: 'Box',
    category: 'foundation',
    directManifestNode: true,
    allowedChildren: [],
    props: {},
  },
  Text: {
    name: 'Text',
    category: 'component',
    directManifestNode: true,
    allowedChildren: [],
    props: { text: { type: 'string' } },
    events: {
      press: {
        eventType: 'text.press',
        label: 'Press',
        description: 'Text was pressed.',
      },
    },
  },
  TabletopTable: {
    name: 'TabletopTable',
    category: 'pattern',
    directManifestNode: true,
    allowedChildren: [],
    props: {},
  },
  MissingElement: {
    name: 'MissingElement',
    category: 'pattern',
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
