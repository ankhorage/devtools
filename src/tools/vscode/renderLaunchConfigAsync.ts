import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { isRecord } from '@ankhorage/utility/object';

/*** Render the universal launch asset while retaining repository-owned launch configurations. */
export async function renderLaunchConfigAsync(targetDirectory: string): Promise<string> {
  const canonical = await readFile(new URL('./files/launch.json', import.meta.url), 'utf8');
  try {
    const existing = await readFile(join(targetDirectory, '.vscode/launch.json'), 'utf8');
    return hasUniversalLaunch(existing, canonical) ? canonical : existing;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return canonical;
    throw error;
  }
}

/*** Recognize the managed universal launch shape independently of its display name. */
function hasUniversalLaunch(existing: string, canonical: string): boolean {
  try {
    const source = JSON.parse(existing) as unknown;
    const reference = JSON.parse(canonical) as unknown;
    if (!isRecord(source) || !isRecord(reference)) return false;
    if (
      source.version !== reference.version ||
      Object.keys(source).length !== Object.keys(reference).length
    ) {
      return false;
    }
    if (!Array.isArray(source.configurations) || !Array.isArray(reference.configurations))
      return false;
    if (source.configurations.length !== 1 || reference.configurations.length !== 1) return false;
    const launch: unknown = source.configurations[0];
    const universal: unknown = reference.configurations[0];
    if (!isRecord(launch) || !isRecord(universal)) return false;
    const { name: _localName, ...localFields } = launch;
    const { name: _canonicalName, ...canonicalFields } = universal;
    return (
      Object.keys(localFields).length === Object.keys(canonicalFields).length &&
      Object.entries(canonicalFields).every(([key, value]) =>
        Object.entries(localFields).some(
          ([localKey, localValue]) => key === localKey && value === localValue,
        ),
      )
    );
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}
