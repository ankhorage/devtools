import { createRequire } from 'node:module';

import { type Config, format } from 'prettier';

const require = createRequire(import.meta.url);
const sharedPrettierConfig = require('./index.cjs') as Config;

/*** Format YAML with the published Devtools Prettier policy. */
export async function formatYamlAsync(contents: string): Promise<string> {
  return await format(contents, {
    ...sharedPrettierConfig,
    parser: 'yaml',
  });
}
