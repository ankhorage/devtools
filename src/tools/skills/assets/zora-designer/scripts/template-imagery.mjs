import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';

const IMAGE_CONTENT_TYPES = {
  'image/avif': '.avif',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

/*** Prepare immutable template evidence and runtime images through the released Templates asset API. */
export async function prepareTemplateImagery(input, targetDirectory, manifest, owners) {
  const imagery = input.imagery ?? {};
  assertRecord(imagery, 'imagery');
  const root = `assets/templates/${input.category.replaceAll('_', '-')}/${input.templateId}`;
  const conceptSeries = await prepareEvidenceSeries(
    imagery.conceptSeries ?? [],
    'concept series',
    `${root}/evidence/concepts`,
  );
  const runtimeCaptures = await prepareEvidenceSeries(
    imagery.runtimeCaptures ?? [],
    'runtime captures',
    `${root}/evidence/runtime-captures`,
  );
  const runtimeAssets = await prepareRuntimeAssets(
    imagery.runtimeAssets ?? [],
    `${root}/runtime`,
    `assets/media/${input.templateId}`,
  );
  const resolvedManifest = registerRuntimeAssets(manifest, runtimeAssets);
  assertRuntimeAssetsAreReferenced(resolvedManifest, runtimeAssets);
  const composition = owners.templates.validateTemplateManifest(resolvedManifest, 'release');
  if (composition.status !== 'ready') {
    throw new Error(
      `Manifest is not release-ready after imagery registration: ${composition.diagnostics.map((item) => item.message).join('; ')}`,
    );
  }
  const readyManifest = owners.templates.assertTemplateManifestReady(composition);
  const artifact = owners.templates.createStarterTemplateArtifact(
    readyManifest,
    runtimeAssets.map((asset) => asset.descriptor),
  );
  const files = [...conceptSeries, ...runtimeCaptures, ...runtimeAssets].sort((left, right) =>
    left.destinationPath.localeCompare(right.destinationPath),
  );
  assertUniqueDestinations(files);

  return {
    artifact,
    files,
    inventory: {
      conceptSeries: conceptSeries.map(toEvidenceInventory),
      runtimeCaptures: runtimeCaptures.map(toEvidenceInventory),
      runtimeAssets: runtimeAssets.map(toRuntimeAssetInventory),
    },
  };
}

/*** Write only prevalidated copied image bytes into their canonical checked-in Templates paths. */
export async function writeTemplateImagery(files, targetDirectory, writeFile, mkdir) {
  for (const file of files) {
    const destination = resolve(targetDirectory, file.destinationPath);
    assertInside(targetDirectory, destination, 'Template imagery destination');
    await assertDestinationIsMissing(destination, file.destinationPath);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, file.contents);
  }
}

/*** Reject accidental replacement of an existing checked-in image outside the new variant boundary. */
async function assertDestinationIsMissing(destination, relativeDestination) {
  try {
    await lstat(destination);
  } catch (error) {
    if (isNotFoundError(error)) return;
    throw error;
  }
  throw new Error(`Template imagery destination already exists: ${relativeDestination}`);
}

/*** Prepare one ordered concept or runtime-capture series without confusing evidence for runtime media. */
async function prepareEvidenceSeries(items, label, destinationDirectory) {
  if (!Array.isArray(items)) throw new Error(`${label} must be an array.`);
  const prepared = await Promise.all(
    items.map(async (item) => {
      assertRecord(item, `${label} item`);
      const id = readNonEmptyString(item.id, `${label} item id`);
      const order = readOrder(item.order, `${label} item ${id} order`);
      const mode = readNonEmptyString(item.mode, `${label} item ${id} mode`);
      const state = readNonEmptyString(item.state, `${label} item ${id} state`);
      const image = await readSourceImage(item, `${label} item ${id}`);
      return {
        ...image,
        id,
        order,
        mode,
        state,
        destinationPath: `${destinationDirectory}/${String(order).padStart(3, '0')}-${safeStem(id)}${image.extension}`,
      };
    }),
  );
  assertUniqueIds(prepared, label);
  assertUniqueOrders(prepared, label);
  return prepared.sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
}

/*** Prepare a runtime image, deriving both its packaged source and generated-project target paths. */
async function prepareRuntimeAssets(items, sourceDirectory, targetDirectory) {
  if (!Array.isArray(items)) throw new Error('runtimeAssets must be an array.');
  const prepared = await Promise.all(
    items.map(async (item) => {
      assertRecord(item, 'runtime asset');
      const mediaId = readNonEmptyString(item.mediaId, 'runtime asset mediaId');
      const name = readNonEmptyString(item.name, `runtime asset ${mediaId} name`);
      const image = await readSourceImage(item, `runtime asset ${mediaId}`);
      const stem = safeStem(mediaId);
      const sourcePath = `${sourceDirectory}/${stem}${image.extension}`;
      const targetPath = `${targetDirectory}/${stem}${image.extension}`;
      return {
        ...image,
        mediaId,
        name,
        destinationPath: sourcePath,
        descriptor: {
          sourcePath,
          targetPath,
          contentType: image.contentType,
          sizeBytes: image.sizeBytes,
          sha256: image.sha256,
        },
      };
    }),
  );
  assertUniqueIds(prepared, 'runtime assets', 'mediaId');
  return prepared.sort((left, right) => left.mediaId.localeCompare(right.mediaId));
}

/*** Read immutable image bytes and the complete provenance required for a durable template record. */
async function readSourceImage(item, label) {
  const sourcePath = readNonEmptyString(item.sourcePath, `${label} sourcePath`);
  if (sourcePath.startsWith('blob:') || sourcePath.startsWith('data:')) {
    throw new Error(`${label} sourcePath must name a durable image file, not a transient URL.`);
  }
  const absoluteSourcePath = resolve(sourcePath);
  const stats = await lstat(absoluteSourcePath);
  if (!stats.isFile() || stats.isSymbolicLink()) {
    throw new Error(`${label} sourcePath must be a regular non-symlink file.`);
  }
  const contentType = readContentType(item.contentType, label);
  const width = readPositiveInteger(item.width, `${label} width`);
  const height = readPositiveInteger(item.height, `${label} height`);
  const origin = readNonEmptyString(item.origin, `${label} origin`);
  assertRecord(item.provenance, `${label} provenance`);
  const contents = await readFile(absoluteSourcePath);
  if (contents.byteLength === 0) throw new Error(`${label} sourcePath must not be empty.`);
  return {
    contents,
    contentType,
    extension: IMAGE_CONTENT_TYPES[contentType],
    height,
    origin,
    provenance: item.provenance,
    sha256: createHash('sha256').update(contents).digest('hex'),
    sizeBytes: contents.byteLength,
    width,
  };
}

/*** Register each checked-in runtime file once in the canonical manifest media pool. */
function registerRuntimeAssets(manifest, runtimeAssets) {
  const resolvedManifest = structuredClone(manifest);
  const media = resolvedManifest.media ?? { assets: {} };
  const assets = media.assets ?? {};
  for (const asset of runtimeAssets) {
    if (assets[asset.mediaId] !== undefined) {
      throw new Error(`Manifest media already defines runtime asset: ${asset.mediaId}`);
    }
    assets[asset.mediaId] = {
      id: asset.mediaId,
      name: asset.name,
      kind: 'image',
      source: { kind: 'bundled', path: asset.descriptor.targetPath },
      contentType: asset.contentType,
      metadata: {
        sizeBytes: asset.sizeBytes,
        width: asset.width,
        height: asset.height,
      },
    };
  }
  resolvedManifest.media = { ...media, assets };
  return resolvedManifest;
}

/*** Require every final runtime image asset to serve an exact canonical ZORA Image media reference. */
function assertRuntimeAssetsAreReferenced(manifest, runtimeAssets) {
  const imageMediaIds = new Set();
  for (const screen of Object.values(manifest.screens ?? {})) {
    collectImageMediaIds(screen.root, imageMediaIds);
  }
  for (const runtimeAsset of runtimeAssets) {
    if (!imageMediaIds.has(runtimeAsset.mediaId)) {
      throw new Error(
        `Runtime asset is not referenced by a ZORA Image mediaId: ${runtimeAsset.mediaId}`,
      );
    }
  }
}

/*** Collect only explicit Image source media references from one recursively composed manifest tree. */
function collectImageMediaIds(node, imageMediaIds) {
  if (!isRecord(node)) return;
  if (node.type === 'Image') {
    const mediaId = node.props?.source?.mediaId;
    if (typeof mediaId !== 'string' || mediaId === '') {
      throw new Error('Every final ZORA Image must use one canonical source.mediaId reference.');
    }
    imageMediaIds.add(mediaId);
  }
  for (const child of Array.isArray(node.children) ? node.children : []) {
    collectImageMediaIds(child, imageMediaIds);
  }
}

/*** Project evidence records into a portable artifact inventory without temporary input paths. */
function toEvidenceInventory(item) {
  return {
    id: item.id,
    path: item.destinationPath,
    order: item.order,
    mode: item.mode,
    state: item.state,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    width: item.width,
    height: item.height,
    origin: item.origin,
    provenance: item.provenance,
  };
}

/*** Project a runtime image into artifact evidence and its canonical manifest/project references. */
function toRuntimeAssetInventory(item) {
  return {
    mediaId: item.mediaId,
    sourcePath: item.descriptor.sourcePath,
    targetPath: item.descriptor.targetPath,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    width: item.width,
    height: item.height,
    origin: item.origin,
    provenance: item.provenance,
  };
}

/*** Reject duplicate final destinations before any target repository mutation begins. */
function assertUniqueDestinations(files) {
  const destinations = new Set();
  for (const file of files) {
    if (destinations.has(file.destinationPath)) {
      throw new Error(`Template imagery destination is duplicated: ${file.destinationPath}`);
    }
    destinations.add(file.destinationPath);
  }
}

/*** Reject duplicate source identities while preserving explicit property-specific diagnostics. */
function assertUniqueIds(items, label, field = 'id') {
  const ids = new Set();
  for (const item of items) {
    const id = item[field];
    if (ids.has(id)) throw new Error(`${label} has a duplicate ${field}: ${id}`);
    ids.add(id);
  }
}

/*** Require a meaningful sequence position for each durable evidence image. */
function assertUniqueOrders(items, label) {
  const orders = new Set();
  for (const item of items) {
    if (orders.has(item.order)) throw new Error(`${label} has a duplicate order: ${item.order}`);
    orders.add(item.order);
  }
}

/*** Turn arbitrary durable identities into stable collision-resistant portable file stems. */
function safeStem(value) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .toLowerCase();
  const readable = normalized === '' ? 'image' : normalized;
  return `${readable}-${createHash('sha256').update(value).digest('hex').slice(0, 12)}`;
}

/*** Require one supported image content type and rely on that owner-compatible extension mapping. */
function readContentType(value, label) {
  if (typeof value !== 'string' || !(value in IMAGE_CONTENT_TYPES)) {
    throw new Error(`${label} contentType must be one supported bundled image content type.`);
  }
  return value;
}

/*** Require an explicit non-empty string rather than inferring immutable artifact metadata. */
function readNonEmptyString(value, label) {
  if (typeof value !== 'string' || value.trim() === '')
    throw new Error(`${label} must be non-empty.`);
  return value;
}

/*** Require real measured dimensions and an ordered series index. */
function readPositiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value <= 0)
    throw new Error(`${label} must be a positive integer.`);
  return value;
}

/*** Read an explicit nonnegative evidence-series position. */
function readOrder(value, label) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error(`${label} must be a nonnegative integer.`);
  return value;
}

/*** Reject source and output path escapes at the filesystem handoff boundary. */
function assertInside(parentDirectory, childPath, label) {
  const relativePath = relative(parentDirectory, childPath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    relativePath.includes(`${sep}..${sep}`)
  ) {
    throw new Error(`${label} escapes its owner directory: ${childPath}`);
  }
}

/*** Narrow an unknown input value to one non-array record. */
function assertRecord(value, label) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
}

/*** Narrow filesystem failures to the missing-path condition needed for no-overwrite protection. */
function isNotFoundError(error) {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/*** Narrow unknown manifest data to object-shaped node records. */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
