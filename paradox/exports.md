# Public API

## ApmPackedReleaseCandidate

Kind: `type`
Module: `src/types/apm-release-validation.ts`
Source: `src/types/apm-release-validation.ts:4:1`

Packed bytes and loaded owner evidence supplied to the canonical APM validators.

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| descriptor | property | `unknown` | yes |  |
| descriptorSource | property | `string` | yes |  |
| extension | property | `unknown` | no |  |
| integrity | property | `string` | yes |  |
| packageJson | property | `Readonly<Record<string, unknown>>` | yes |  |

## ApmReleaseValidationOptions

Kind: `type`
Module: `src/types/apm-release-validation.ts`
Source: `src/types/apm-release-validation.ts:13:1`

Explicit release-validation inputs; owner code is never trusted by default.

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| allowOwnerCode | property | `boolean \| undefined` | no |  |
| artifactPath | property | `string \| undefined` | no |  |
| expectedIntegrity | property | `string \| undefined` | no |  |
| previousDescriptors | property | `readonly ApmUpdateDescriptor[] \| undefined` | no |  |
| relatedDescriptors | property | `readonly ApmUpdateDescriptor[] \| undefined` | no |  |

## ApmReleaseValidationResult

Kind: `type`
Module: `src/types/apm-release-validation.ts`
Source: `src/types/apm-release-validation.ts:22:1`

Evidence for one exact packed release; inapplicable never means migration-safe.

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| applicable | property | `boolean` | yes |  |
| artifactPath | property | `string \| undefined` | no |  |
| blockers | property | `readonly string[]` | yes |  |
| integrity | property | `string \| undefined` | no |  |
| packageName | property | `string \| undefined` | no |  |
| packageVersion | property | `string \| undefined` | no |  |
| valid | property | `boolean` | yes |  |

## createConfig

Kind: `function`
Module: `src/tools/eslint/index.ts`
Source: `src/tools/eslint/index.ts:77:1`

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
Source: `src/tools/eslint/index.ts:45:14`

## defaultRestrictedImports

Kind: `value`
Module: `src/tools/eslint/index.ts`
Source: `src/tools/eslint/index.ts:58:14`

## DevtoolsConfigOptions

Kind: `type`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:13:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| additionalIgnores | property | `string[] \| undefined` | no |  |
| allowDefaultProject | property | `string[] \| undefined` | no |  |
| files | property | `string[]` | yes |  |
| includePrettier | property | `boolean \| undefined` | no |  |
| overrides | property | `FlatConfigItem[] \| undefined` | no |  |
| packageJsonPath | property | `string \| undefined` | no |  |
| profile | property | `DevtoolsEslintProfile \| undefined` | no |  |
| project | property | `string[]` | yes |  |
| restrictedImports | property | `RestrictedImport[] \| undefined` | no |  |
| tsconfigRootDir | property | `string` | yes |  |

## DevtoolsEslintProfile

Kind: `unknown`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:10:1`

## DevtoolsKnipConfigOptions

Kind: `type`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:24:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| entry | property | `string[] \| undefined` | no |  |
| ignore | property | `string[] \| undefined` | no |  |
| ignoreBinaries | property | `string[] \| undefined` | no |  |
| ignoreDependencies | property | `(string \| RegExp)[] \| undefined` | no |  |
| ignoreFiles | property | `string[] \| undefined` | no |  |
| project | property | `string[] \| undefined` | no |  |
| workspaces | property | `Record<string, DevtoolsKnipWorkspaceConfigOptions> \| undefined` | no |  |

## DevtoolsKnipMonorepoConfigOptions

Kind: `type`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:28:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| root | property | `DevtoolsKnipWorkspaceConfigOptions \| undefined` | no |  |
| workspaceDefaults | property | `DevtoolsKnipWorkspaceConfigOptions \| undefined` | no |  |
| workspaceGlobs | property | `string[] \| undefined` | no |  |
| workspaces | property | `Record<string, DevtoolsKnipWorkspaceConfigOptions> \| undefined` | no |  |

## DevtoolsKnipWorkspaceConfigOptions

Kind: `type`
Module: `src/tools/knip/index.ts`
Source: `src/tools/knip/index.ts:15:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| entry | property | `string[] \| undefined` | no |  |
| ignore | property | `string[] \| undefined` | no |  |
| ignoreBinaries | property | `string[] \| undefined` | no |  |
| ignoreDependencies | property | `(string \| RegExp)[] \| undefined` | no |  |
| ignoreFiles | property | `string[] \| undefined` | no |  |
| project | property | `string[] \| undefined` | no |  |

## FlatConfigItem

Kind: `unknown`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:3:1`

## provider

Kind: `value`
Module: `src/cli/index.ts`
Source: `src/cli/index.ts:40:7`

## ResolvedDevtoolsEslintProfile

Kind: `unknown`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:11:1`

## RestrictedImport

Kind: `type`
Module: `src/tools/eslint/types.ts`
Source: `src/tools/eslint/types.ts:5:1`

### Members

| Name | Kind | Type | Required | Description |
| --- | --- | --- | --- | --- |
| message | property | `string` | yes |  |
| name | property | `string` | yes |  |

## synchronizeApmReleaseDescriptorAsync

Kind: `function`
Module: `src/features/apm-release-validation/composition/synchronizeApmReleaseDescriptorAsync.ts`
Source: `src/features/apm-release-validation/composition/synchronizeApmReleaseDescriptorAsync.ts:5:1`

Compose descriptor version synchronization with the bounded Node filesystem adapter.

### Signatures

- `(targetDirectory: string) => Promise<boolean>`
  - targetDirectory: `string`
  - returns: `Promise<boolean>`

## validateApmReleaseCandidate

Kind: `function`
Module: `src/features/apm-release-validation/application/validateApmReleaseCandidate.ts`
Source: `src/features/apm-release-validation/application/validateApmReleaseCandidate.ts:31:1`

Validate packed owner evidence using the released APM protocol, never a copied schema.
Opt-in packages declare ankh.apm with protocolVersion and a package-relative descriptor.
No metadata means not applicable, not a claim that no migration is needed. The descriptor
declares supported no-migration, required migration, or unsupported/manual history explicitly.
Previous descriptors enforce immutable migration checksums and related descriptors validate
cross-owner prerequisites. Package-owned source-to-target tests must also cover skipped versions,
idempotency, interruption/recovery, and unsupported historical states.

### Signatures

- `(candidate: ApmPackedReleaseCandidate, options?: ApmReleaseValidationOptions) => ApmReleaseValidationResult`
  - candidate: `ApmPackedReleaseCandidate`
  - options: `ApmReleaseValidationOptions` (optional)
  - returns: `ApmReleaseValidationResult`

## validatePackedApmReleaseAsync

Kind: `function`
Module: `src/features/apm-release-validation/composition/validatePackedApmReleaseAsync.ts`
Source: `src/features/apm-release-validation/composition/validatePackedApmReleaseAsync.ts:17:1`

Validate script-free publish bytes and optionally retain that exact accepted archive.
Release order is APM protocol, package-owner metadata/code, then consuming applications.
Build after Changesets versioning and descriptor synchronization. Execute package-owned
acceptance tests, then validate with explicit owner-code consent. The child probe uses the
packed package's native public export resolution and installed dependencies, not omitted source.
Consent permits trusted executable code; a child process is not a security sandbox.
An artifactPath retains accepted bytes exclusively, so publication need not repack or rerun
lifecycle scripts. expectedIntegrity rejects a stale candidate before any owner code loads.

### Signatures

- `(targetDirectory: string, options?: ApmReleaseValidationOptions) => Promise<ApmReleaseValidationResult>`
  - options: `ApmReleaseValidationOptions` (optional)
  - targetDirectory: `string`
  - returns: `Promise<ApmReleaseValidationResult>`
