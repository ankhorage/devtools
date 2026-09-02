import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { afterEach, expect, it } from 'bun:test';

import {
  categoryPath,
  cleanupTemplatesFixtures,
  createScaffoldInput,
  createTemplatesFixture,
  imageEvidence,
  writeFixtureImages,
  writeJson,
} from './zoraDesignerImagery.fixtures.js';

const SCAFFOLD_SCRIPT = resolve(
  'src/tools/skills/assets/zora-designer/scripts/scaffold-template.mjs',
);
afterEach(async () => {
  await cleanupTemplatesFixtures();
});

it('separates concept evidence, runtime captures, and generated-project image assets', async () => {
  const target = await createTemplatesFixture();
  const result = await scaffoldImageryFixture(target, 'evidence-board');

  expect(result.exitCode).toBe(0);
  const artifact = await readFile(join(target, 'zora-designer.md'), 'utf8');
  expect(artifact).toContain('conceptSeries');
  expect(artifact).toContain('runtimeCaptures');
  expect(artifact).toContain('runtimeAssets');
  expect(artifact).toContain('assets/media/evidence-board');
  await expectPersistedContents(result.stdout, target);

  const categoryDirectory = categoryPath(target);
  const registry = await readFile(join(categoryDirectory, 'index.ts'), 'utf8');
  expect(registry).toContain('assets: AUTHORED_EVIDENCE_BOARD_ASSETS');
  const variantDirectory = join(categoryDirectory, 'evidence-board');
  expect(await readFile(join(variantDirectory, 'assets.ts'), 'utf8')).toContain('hero-image');
  expect(await readFile(join(variantDirectory, 'manifest.ts'), 'utf8')).toContain('assets/media');
});

it('produces deterministic source and artifact records for the same image inputs', async () => {
  const left = await createTemplatesFixture();
  const right = await createTemplatesFixture();
  await scaffoldImageryFixture(left, 'evidence-board');
  await scaffoldImageryFixture(right, 'evidence-board');

  for (const relativePath of [
    'zora-designer.md',
    'src/templates/starter/categories/business-productivity/evidence-board/assets.ts',
    'src/templates/starter/categories/business-productivity/evidence-board/manifest.ts',
  ]) {
    expect(await readFile(join(left, relativePath), 'utf8')).toBe(
      await readFile(join(right, relativePath), 'utf8'),
    );
  }
});

it('rejects transient or missing runtime image sources before creating template source', async () => {
  const target = await createTemplatesFixture();
  const inputPath = join(target, 'invalid-scaffold.json');
  for (const sourcePath of ['blob:https://example.test/image', join(target, 'missing.png')]) {
    await writeJson(inputPath, blockedImageInput(target, sourcePath));
    const result = await runScript([inputPath], target);
    expect(result.exitCode).toBe(1);
  }
  expect(await Bun.file(join(categoryPath(target), 'blocked-image', 'manifest.ts')).exists()).toBe(
    false,
  );
});

it('rejects a runtime image that no final ZORA Image references', async () => {
  const target = await createTemplatesFixture();
  const images = await writeFixtureImages(target);
  const inputPath = join(target, 'unowned-image.json');
  await writeJson(inputPath, {
    ...createScaffoldInput(target, 'unowned-image'),
    imagery: {
      conceptSeries: [],
      runtimeCaptures: [],
      runtimeAssets: [
        {
          mediaId: 'unused-image',
          name: 'Unused image',
          sourcePath: images.hero,
          contentType: 'image/svg+xml',
          width: 64,
          height: 64,
          origin: 'generated',
          provenance: { tool: 'fixture' },
        },
      ],
    },
  });

  const result = await runScript([inputPath], target);
  expect(result.exitCode).toBe(1);
  expect(result.stderr).toContain('not referenced by a ZORA Image mediaId');
});

/*** Scaffold a complete imagery-bearing template from stable generated fixture images. */
async function scaffoldImageryFixture(target: string, templateId: string) {
  const imagePaths = await writeFixtureImages(target);
  const inputPath = join(target, `${templateId}.json`);
  await writeJson(inputPath, {
    ...createScaffoldInput(target, templateId),
    imagery: {
      conceptSeries: [
        imageEvidence(
          'concept-home',
          imagePaths.concept,
          'image/png',
          1200,
          800,
          'light',
          'default',
          0,
        ),
      ],
      runtimeCaptures: [
        imageEvidence(
          'capture-home',
          imagePaths.capture,
          'image/png',
          1200,
          800,
          'light',
          'default',
          0,
        ),
      ],
      runtimeAssets: [
        {
          mediaId: 'hero-image',
          name: 'Evidence board hero',
          sourcePath: imagePaths.hero,
          contentType: 'image/svg+xml',
          width: 64,
          height: 64,
          origin: 'generated',
          provenance: { tool: 'fixture' },
        },
      ],
    },
  });
  return runScript([inputPath], target);
}

/*** Build one invalid runtime-image input that differs only in the unretainable source location. */
function blockedImageInput(target: string, sourcePath: string): Record<string, unknown> {
  return {
    ...createScaffoldInput(target, 'blocked-image'),
    imagery: {
      conceptSeries: [],
      runtimeCaptures: [],
      runtimeAssets: [
        {
          mediaId: 'blocked-image',
          name: 'Blocked image',
          sourcePath,
          contentType: 'image/png',
          width: 100,
          height: 100,
          origin: 'generated',
          provenance: { tool: 'fixture' },
        },
      ],
    },
  };
}

/*** Confirm that each class of image was copied to a separate durable target path. */
async function expectPersistedContents(stdout: string, targetDirectory: string): Promise<void> {
  const imagery = readImagery(stdout);
  const concept = readFirstImage(imagery, 'conceptSeries');
  const capture = readFirstImage(imagery, 'runtimeCaptures');
  const runtimeAsset = readFirstImage(imagery, 'runtimeAssets');
  expect(await readFile(join(targetDirectory, readString(concept.path)), 'utf8')).toBe(
    'concept-image',
  );
  expect(await readFile(join(targetDirectory, readString(capture.path)), 'utf8')).toBe(
    'runtime-capture',
  );
  expect(await readFile(join(targetDirectory, readString(runtimeAsset.sourcePath)), 'utf8')).toBe(
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
}

/*** Decode the stable image inventories emitted by the scaffold boundary. */
function readImagery(stdout: string): Record<string, unknown> {
  const parsed = JSON.parse(stdout) as { readonly imagery: unknown };
  if (
    typeof parsed.imagery !== 'object' ||
    parsed.imagery === null ||
    Array.isArray(parsed.imagery)
  ) {
    throw new Error('Scaffold did not return an imagery inventory.');
  }
  return parsed.imagery as Record<string, unknown>;
}

/*** Resolve one non-empty inventory item while preserving runtime validation of script JSON. */
function readFirstImage(imagery: Record<string, unknown>, group: string): Record<string, unknown> {
  const entries = imagery[group];
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new Error(`Missing scaffold imagery inventory: ${group}`);
  }
  const [image] = entries.filter(isRecord);
  return image;
}

/*** Narrow script JSON to an object-shaped artifact inventory entry. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/*** Read a persisted artifact path after the boundary has structurally validated its inventory. */
function readString(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Expected one persisted image path.');
  return value;
}

/*** Run the portable scaffold script and return deterministic process output. */
async function runScript(arguments_: string[], cwd: string) {
  const process = Bun.spawn({
    cmd: ['bun', SCAFFOLD_SCRIPT, ...arguments_],
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
