import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const ICON_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
export const IMAGE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7x8AAAAASUVORK5CYII=',
  'base64',
);

/*** Create manifest configuration shared by the asset scaffolding fixture. */
export function createFixtureManifest(theme: Record<string, unknown>): Record<string, unknown> {
  return {
    metadata: {
      name: 'Evidence Board',
      slug: 'evidence-board',
      version: '1.0.0',
      category: 'business_productivity',
      themeId: 'evidence-theme',
    },
    themes: [theme],
    activeThemeId: 'evidence-theme',
    infra: { modules: [] },
    settings: { localization: { defaultLocale: 'en', locales: ['en'] } },
  };
}

/*** Create separate screen evidence, image content and SVG with runtime references. */
export async function createAssetFixture(root: string) {
  await mkdir(join(root, 'assets/images/svg'), { recursive: true });
  await mkdir(join(root, 'assets/screens'), { recursive: true });
  await writeFile(join(root, 'assets/images/svg/book.svg'), ICON_SVG);
  await writeFile(join(root, 'assets/images/cover.png'), IMAGE_PNG);
  await writeFile(join(root, 'assets/screens/home.png'), IMAGE_PNG);
  const assets = createAssetEntries();
  const bundle = {
    assets,
    screens: [{ sourcePath: 'assets/screens/home.png', targetPath: 'assets/screens/home.png' }],
  };
  const bundlePath = join(root, 'design-assets.json');
  await writeFile(bundlePath, JSON.stringify(bundle));
  const manifest = {
    media: {
      assets: Object.fromEntries(
        assets.map((asset) => [
          asset.mediaId,
          {
            id: asset.mediaId,
            kind: 'image',
            source: { kind: 'bundled', path: asset.targetPath },
            contentType: asset.contentType,
          },
        ]),
      ),
    },
    navigator: {
      type: 'stack',
      routes: [{ name: 'home', screenId: 'home', icon: { source: { mediaId: 'book' } } }],
    },
    screens: {
      home: {
        id: 'home',
        name: 'Home',
        root: { id: 'cover-image', type: 'Image', props: { source: { mediaId: 'cover' } } },
      },
    },
  };
  return { bundle, bundlePath, manifest };
}

/*** Describe the reusable icon and image inputs independently of filesystem setup. */
function createAssetEntries() {
  return [
    {
      mediaId: 'book',
      role: 'icon',
      sourcePath: 'assets/images/svg/book.svg',
      targetPath: 'assets/images/svg/book.svg',
      contentType: 'image/svg+xml',
      usages: ['/navigator/routes/0/icon/source'],
    },
    {
      mediaId: 'cover',
      role: 'image',
      sourcePath: 'assets/images/cover.png',
      targetPath: 'assets/images/cover.png',
      contentType: 'image/png',
      usages: ['/screens/home/root/props/source'],
    },
  ];
}
