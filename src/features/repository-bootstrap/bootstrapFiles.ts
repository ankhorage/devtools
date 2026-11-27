import type { ManagedFileDefinition } from '../managed-files/managedFiles.js';

export const bootstrapFiles = [
  {
    relativePath: 'tsconfig.json',
    mode: 'create-only',
    contents: `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["bun", "node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts"]
}
`,
  },
  {
    relativePath: 'tsconfig.build.json',
    mode: 'create-only',
    contents: `{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "rootDir": "src",
    "outDir": "dist"
  },
  "exclude": ["**/*.test.ts", "**/*.spec.ts"]
}
`,
  },
  {
    relativePath: 'paradox.config.ts',
    mode: 'create-only',
    contents: `import { defineParadoxConfig } from '@ankhorage/paradox';

export default defineParadoxConfig({
  mode: 'write',
  collaborators: false,
  package: { root: '.', entrypoints: ['src/index.ts'] },
  output: { dir: './paradox' },
});
`,
  },
  {
    relativePath: 'CHANGELOG.md',
    mode: 'create-only',
    contents: '# Changelog\n',
  },
] as const satisfies readonly ManagedFileDefinition[];
