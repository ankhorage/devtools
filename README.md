# @ankhorage/devtools

Shared Lint and Format Configuration for Ankhorage.

This package provides a unified, modern ESLint and Prettier configuration policy used across Ankhorage projects. It is built on top of **ESLint Flat Config** and **typescript-eslint**, ensuring a seamless, type-safe development experience.

## Installation

```bash
bun add -d @ankhorage/devtools
# or
npm install --save-dev @ankhorage/devtools
```

## Features

- **One Package, Two Exports**: Access everything via `@ankhorage/devtools/eslint` and `@ankhorage/devtools/prettier`.
- **Modern Standards**: Built for ESLint 9+ and Prettier 3+.
- **Type-Safe**: Uses `typescript-eslint`'s recommended type-checked and stylistic rules.
- **Unified Policy**: Converges all repositories to a single, high-quality linting standard.

## Usage

### ESLint

Create an `eslint.config.mjs` file in your project root:

```javascript
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createConfig } from '@ankhorage/devtools/eslint';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default createConfig({
  tsconfigRootDir: __dirname,
  project: ['./tsconfig.json'],
  files: ['src/**/*.ts'],
});
```

#### Configuration Options

The `createConfig` function accepts the following required options:

- `tsconfigRootDir`: The root directory for tsconfig resolution (typically `import.meta.dirname` or equivalent).
- `project`: An array of paths to your `tsconfig` files (e.g., `['./tsconfig.json']`).
- `files`: An array of glob patterns for the files you want to lint (e.g., `['src/**/*.{ts,tsx}']`).

Optional options:

- `allowDefaultProject`: Glob patterns for files to allow in the default project.
- `additionalIgnores`: Extra glob patterns to ignore.
- `restrictedImports`: An array of `{ name, message }` objects to append to the default restricted imports.
- `overrides`: An array of raw ESLint flat config objects to append to the configuration.
- `includePrettier`: Whether to include the Prettier configuration (defaults to `true`).

### Prettier

Create a `prettier.config.cjs` file in your project root:

```javascript
/** @type {import('prettier').Config} */
module.exports = require('@ankhorage/devtools/prettier');
```

**Note**: You should keep a local `.prettierignore` file in your repository to define ignored patterns.

## Examples

Check the [examples](./examples) directory for copy-pasteable configurations:

- `examples/monorepo/eslint.config.mjs`: For monorepo project structures.
- `examples/package/eslint.config.mjs`: For standalone package structures.

## License

MIT
