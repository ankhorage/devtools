# Public API

## createConfig

Kind: `function`
Module: `src/tools/eslint/index.ts`
Source: `src/tools/eslint/index.ts:75:1`

### Signatures

- `(options: DevtoolsConfigOptions) => Linter.Config<import("@eslint/core").RulesConfig>[]`
  - options: `DevtoolsConfigOptions`
  - returns: `Linter.Config<import("@eslint/core").RulesConfig>[]`

## createKnipConfig

Kind: `function`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:38:1`

Build shared Knip configuration while preserving repository-specific discovery.

### Signatures

- `(options?: DevtoolsKnipConfigOptions) => KnipConfig`
  - options: `DevtoolsKnipConfigOptions` (optional)
  - returns: `KnipConfig`

## createKnipMonorepoConfig

Kind: `function`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:53:1`

Build shared monorepo Knip configuration.

### Signatures

- `(options?: DevtoolsKnipMonorepoConfigOptions) => KnipConfig`
  - options: `DevtoolsKnipMonorepoConfigOptions` (optional)
  - returns: `KnipConfig`

## defaultIgnores

Kind: `value`
Module: `src/tools/eslint/index.ts`
Source: `src/tools/eslint/index.ts:43:14`

## defaultRestrictedImports

Kind: `value`
Module: `src/tools/eslint/index.ts`
Source: `src/tools/eslint/index.ts:56:14`

## DevtoolsConfigOptions

Kind: `type`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:13:1`

### Members

| Name                | Kind     | Type                                 | Required | Description |
| ------------------- | -------- | ------------------------------------ | -------- | ----------- |
| additionalIgnores   | property | `string[] \| undefined`              | no       |             |
| allowDefaultProject | property | `string[] \| undefined`              | no       |             |
| files               | property | `string[]`                           | yes      |             |
| includePrettier     | property | `boolean \| undefined`               | no       |             |
| overrides           | property | `FlatConfigItem[] \| undefined`      | no       |             |
| packageJsonPath     | property | `string \| undefined`                | no       |             |
| profile             | property | `DevtoolsEslintProfile \| undefined` | no       |             |
| project             | property | `string[]`                           | yes      |             |
| restrictedImports   | property | `RestrictedImport[] \| undefined`    | no       |             |
| tsconfigRootDir     | property | `string`                             | yes      |             |

## DevtoolsEslintProfile

Kind: `unknown`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:10:1`

## DevtoolsKnipConfigOptions

Kind: `type`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:24:1`

### Members

| Name               | Kind     | Type                                                              | Required | Description |
| ------------------ | -------- | ----------------------------------------------------------------- | -------- | ----------- |
| entry              | property | `string[] \| undefined`                                           | no       |             |
| ignore             | property | `string[] \| undefined`                                           | no       |             |
| ignoreBinaries     | property | `string[] \| undefined`                                           | no       |             |
| ignoreDependencies | property | `(string \| RegExp)[] \| undefined`                               | no       |             |
| ignoreFiles        | property | `string[] \| undefined`                                           | no       |             |
| project            | property | `string[] \| undefined`                                           | no       |             |
| workspaces         | property | `Record<string, DevtoolsKnipWorkspaceConfigOptions> \| undefined` | no       |             |

## DevtoolsKnipMonorepoConfigOptions

Kind: `type`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:28:1`

### Members

| Name              | Kind     | Type                                                              | Required | Description |
| ----------------- | -------- | ----------------------------------------------------------------- | -------- | ----------- |
| root              | property | `DevtoolsKnipWorkspaceConfigOptions \| undefined`                 | no       |             |
| workspaceDefaults | property | `DevtoolsKnipWorkspaceConfigOptions \| undefined`                 | no       |             |
| workspaceGlobs    | property | `string[] \| undefined`                                           | no       |             |
| workspaces        | property | `Record<string, DevtoolsKnipWorkspaceConfigOptions> \| undefined` | no       |             |

## DevtoolsKnipWorkspaceConfigOptions

Kind: `type`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:15:1`

### Members

| Name               | Kind     | Type                                | Required | Description |
| ------------------ | -------- | ----------------------------------- | -------- | ----------- |
| entry              | property | `string[] \| undefined`             | no       |             |
| ignore             | property | `string[] \| undefined`             | no       |             |
| ignoreBinaries     | property | `string[] \| undefined`             | no       |             |
| ignoreDependencies | property | `(string \| RegExp)[] \| undefined` | no       |             |
| ignoreFiles        | property | `string[] \| undefined`             | no       |             |
| project            | property | `string[] \| undefined`             | no       |             |

## FlatConfigItem

Kind: `unknown`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:3:1`

## provider

Kind: `value`
Module: `src/cli/index.ts`
Source: `src/cli/index.ts:31:7`

## ResolvedDevtoolsEslintProfile

Kind: `unknown`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:11:1`

## RestrictedImport

Kind: `type`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:5:1`

### Members

| Name    | Kind     | Type     | Required | Description |
| ------- | -------- | -------- | -------- | ----------- |
| message | property | `string` | yes      |             |
| name    | property | `string` | yes      |             |
