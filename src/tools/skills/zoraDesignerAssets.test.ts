import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, expect, test } from 'bun:test';

import { prepareAssetBundle } from './assets/zora-designer/scripts/asset-bundle.ts';
import { createAssetFixture, IMAGE_PNG } from './assetTestFixture.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

/*** Prepare one isolated bundle for observable asset-promotion tests. */
async function fixture() {
  const root = await mkdtemp('/tmp/designer-assets-test-');
  roots.push(root);
  return { root, ...(await createAssetFixture(root)) };
}

test('prepares identical reusable image bytes and separate screen evidence for promotion', async () => {
  const { bundlePath, manifest } = await fixture();
  const files = await prepareAssetBundle(bundlePath, manifest);
  expect(files.map((file) => file.targetPath)).toEqual([
    'assets/images/svg/book.svg',
    'assets/images/cover.png',
    'assets/screens/home.png',
  ]);
  expect(files[1]?.bytes).toEqual(IMAGE_PNG);
  expect(await prepareAssetBundle(bundlePath)).toEqual(files);
});

test('rejects missing files before template output can be created', async () => {
  const { root, bundlePath, manifest } = await fixture();
  await rm(join(root, 'assets/images/cover.png'));
  await rejects(prepareAssetBundle(bundlePath, manifest));
});

test('rejects dangling image references and unused icon assets', async () => {
  const { bundlePath, manifest } = await fixture();
  manifest.screens.home.root.props.source.mediaId = 'missing';
  await rejects(prepareAssetBundle(bundlePath, manifest), /Asset usage/u);
  manifest.screens.home.root.props.source.mediaId = 'cover';
  manifest.navigator.routes[0].icon.source.mediaId = 'other-icon';
  await rejects(prepareAssetBundle(bundlePath, manifest), /Asset usage/u);
});

test('rejects absent inventory entries for registered bundled images', async () => {
  const { bundlePath, bundle, manifest } = await fixture();
  bundle.assets.pop();
  await writeFile(bundlePath, JSON.stringify(bundle));
  await rejects(prepareAssetBundle(bundlePath, manifest), /Bundled media/u);
});

test('rejects screen evidence, traversal and duplicate destinations as runtime assets', async () => {
  const { bundlePath, bundle } = await fixture();
  for (const target of [
    'assets/screens/cover.png',
    'assets/images/../cover.png',
    'assets/images\\cover.png',
  ]) {
    bundle.assets[1].targetPath = target;
    await writeFile(bundlePath, JSON.stringify(bundle));
    await rejects(prepareAssetBundle(bundlePath), /Asset path/u);
  }
  bundle.assets[1].targetPath = 'assets/images/cover.png';
  bundle.assets.push({ ...bundle.assets[1], mediaId: 'duplicate-cover' });
  await writeFile(bundlePath, JSON.stringify(bundle));
  await rejects(prepareAssetBundle(bundlePath), /Duplicate asset targetPath/u);
});

test('rejects raster data masquerading as vector artwork and mismatched image bytes', async () => {
  const { root, bundlePath } = await fixture();
  await writeFile(
    join(root, 'assets/images/svg/book.svg'),
    '<svg viewBox="0 0 24 24"><image href="data:image/png;base64,AAAA"/></svg>',
  );
  await rejects(prepareAssetBundle(bundlePath), /standalone image/u);
  await createAssetFixture(root);
  await writeFile(join(root, 'assets/images/cover.png'), 'not a PNG');
  await rejects(prepareAssetBundle(bundlePath), /standalone image/u);
});

test('rejects a source symlink that leaves the bundle', async () => {
  const { root, bundlePath } = await fixture();
  const outside = await mkdtemp('/tmp/designer-outside-test-');
  roots.push(outside);
  await writeFile(join(outside, 'image.png'), IMAGE_PNG);
  await rm(join(root, 'assets/images/cover.png'));
  await symlink(join(outside, 'image.png'), join(root, 'assets/images/cover.png'));
  await rejects(prepareAssetBundle(bundlePath), /inside the bundle/u);
});
import { rejects } from 'node:assert/strict';
