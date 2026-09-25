import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const TEMPLATE_URL = new URL('./files/renovate.json5', import.meta.url);
const LEGACY_HEADER_PATTERN = /^\/\*\*\*([\s\S]*?)\*\/\n/u;

/*** Render Renovate config while preserving repository-owned rules and removing obsolete Paradox metadata. */
export async function renderRenovateConfigAsync(targetDirectory: string): Promise<string> {
  const targetPath = join(targetDirectory, 'renovate.json5');
  let current: string;

  try {
    current = await readFile(targetPath, 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return await readFile(TEMPLATE_URL, 'utf8');
    }
    throw error;
  }

  return migrateLegacyRenovateHeader(current);
}

/*** Convert the historical managed Paradox header to an ordinary comment without changing config data. */
function migrateLegacyRenovateHeader(contents: string): string {
  const match = LEGACY_HEADER_PATTERN.exec(contents);
  if (match === null) return contents;

  const [header, body = ''] = match;
  if (!body.includes('Repository configuration')) return contents;
  if (!body.includes('@usage') && !body.includes('@readme')) return contents;

  const migratedBody = body
    .split('\n')
    .filter((line) => !/^\s*\*\s+@(usage|readme)\s*$/u.test(line))
    .join('\n');

  return `/**${migratedBody}*/\n${contents.slice(header.length)}`;
}
