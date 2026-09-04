# Named Repository Structures

This reference is the canonical repository map for reusable Ankhorage platform/packages. The trees
show ownership, not a requirement to create empty directories. When a responsibility exists, put it
in the named location instead of inventing a sibling taxonomy.

Repository/package names should express the bounded capability. A provider or implementation detail
belongs below that boundary, not in the repository name. Manifest-owned standalone capabilities use
the same noun as their manifest property where practical.

## Runtime

Repository: `ankhorage/runtime` / `@ankhorage/runtime`

Owns manifest rendering, action execution, runtime bindings/state orchestration, and runtime-facing
registries. It consumes released Contracts; it does not own authoring or generated Expo layout code.

```text
src/
├── rendering/          # screen/node rendering and component resolution
├── actions/            # action dispatch/execution
├── bindings/           # runtime data/event binding behavior
├── state/              # runtime state adapters and orchestration
├── registry/           # runtime component/action registries
├── manifest/           # runtime interpretation of portable contract slices
└── index.ts            # intentional public surface
```

Keep React composition at rendering/application edges; pure manifest interpretation belongs outside
components. Existing flat files move into these domains when materially changed rather than via an
unrelated bulk shuffle.

## Contracts

Repository: `ankhorage/contracts` / `@ankhorage/contracts`

Owns portable serialized shapes, constants, and structural parsing only. It never depends on the
packages that execute those contracts.

```text
src/
├── appManifest/        # structural AppManifest parsers/validators
├── data/               # data-source/API contract slices
├── cli/                # portable CLI/provider contract slices
├── auth.ts
├── bindings.ts
├── deploy.ts            # AppDeployManifest
├── media.ts             # MediaManifest
├── navigator.ts         # AppNavigatorManifest
├── repository.ts        # RepositoryManifest
├── requirements.ts
├── state.ts
├── storage.ts
├── theme.ts
├── types.ts             # aggregate cross-slice app contracts
└── index.ts
```

New independently consumable manifest slices get a focused module and, when useful, a deliberate
package subpath. Do not put runtime adapters, React components, network clients, generators, or
provider behavior in Contracts.

## Templates

Repository: `ankhorage/templates` / `@ankhorage/templates`

Owns template catalog data, category composition, authoring helpers, fixtures, and project seeds.

```text
src/
├── authoring/          # manifest/category composition
├── categories/         # category-specific authored template data
├── fixtures/           # reusable deterministic fixtures
├── templates/          # template definitions/catalog entries
├── projectSeed.ts      # project seed composition
└── index.ts

test/                   # cross-template/category acceptance
```

Templates may compose `AppManifest`, but standalone capability packages it calls receive only their
relevant manifest slice.

## Navigator

Repository: `ankhorage/navigator` / `@ankhorage/navigator`

Owns `manifest.navigator` behavior. Description begins with `Standalone`. It consumes only
`AppNavigatorManifest` and related types from `@ankhorage/contracts/navigator`, never `AppManifest`.

Current canonical tree:

```text
src/
├── definitions/        # package-owned planning/output definitions
├── topology/           # canonical topology/preset resolution
├── presentation/       # presentation/responsive policy
├── expo-router/        # Expo Router planning/generation policy
├── metadata/           # serializable authoring/package metadata
├── index.test.ts       # public/boundary behavior
└── index.ts            # standalone public planning API
```

Expo Router remains an application/runtime dependency of generated Expo apps unless Navigator source
actually imports a released Router API. Platform/provider modules belong under `expo-router/`; do not
copy Router internals. Topology, implementation, presentation, and flows remain separate concepts.

## Repository

Canonical repository: `ankhorage/repository` / `@ankhorage/repository`.
Current physical pre-rename repository may still be `ankhorage/gh`; that is not a separate capability.

Owns `manifest.repository` behavior. Description begins with `Standalone`. It consumes only
`RepositoryManifest` and related types from `@ankhorage/contracts/repository`, never `AppManifest`.

```text
src/
├── connection/
│   ├── definitions/    # provider-neutral and provider result/request definitions
│   ├── ports/          # repository-owned external boundaries
│   ├── services/       # provider-neutral orchestration + connection use cases
│   ├── adapters/
│   │   └── ...         # GitHub/gh and filesystem adapters
│   └── utils/          # connection-local utilities only
├── github/             # deliberate GitHub public provider subpath
├── metadata/           # package/authoring metadata
├── cli/                # `ankh repository ...` edge
└── index.ts            # provider-neutral Repository public API
```

Project-local desired state uses `.ankhorage/repository.json`. GitHub and the local `gh` executable
are provider/adapter details. Do not preserve `@ankhorage/gh`, `gh.connect`, or `.ankhorage/gh.json`
as compatibility paths after the rename.

## ZORA

Repository: `ankhorage/zora` / `@ankhorage/zora`

Owns app-facing design-system components, patterns, semantic theme recipes, metadata, and providers.

```text
src/
├── components/         # primitive/app-facing components
├── patterns/           # composed reusable UI patterns
├── theme/              # semantic ZORA tokens/recipes
├── metadata/           # serializable authoring metadata
├── provider/           # ZORA React composition/provider boundary
└── index.ts
```

Do not move general rendering/layout mechanics from Surface into ZORA merely for convenience.

## Surface

Repository: `ankhorage/surface` / `@ankhorage/surface`

Owns low-level render foundation, responsive/layout mechanics, theme plumbing and platform-neutral
surface primitives below ZORA.

```text
src/
├── layout/             # layout mechanics
├── responsive/         # breakpoints and responsive resolution
├── theme/              # low-level theme plumbing
├── rendering/          # render-foundation behavior
├── primitives/         # non-app-branded surface primitives
└── index.ts
```

Surface must not absorb ZORA recipes or Studio authoring behavior.

## Expo Runtime

Repository: `ankhorage/expo-runtime` / `@ankhorage/expo-runtime`

Owns the Expo-specific runtime boundary required by otherwise platform-neutral Ankhorage packages.

```text
src/
├── fonts/              # Expo font runtime/provider boundary
├── icons/              # Expo icon runtime/provider boundary
├── platform/           # Expo-specific platform adapters
├── provider/           # runtime composition when required
└── index.ts
```

Use released Expo public APIs only. Do not copy app navigation/generation ownership into Expo Runtime.

## Value Libraries

Named repository: `ankhorage/color-theory`.

Small portable value/algorithm libraries keep domain modules directly under `src/` until multiple
cohesive sibling responsibilities justify directories.

```text
src/
├── <domain-concept>.ts
├── <domain-concept>.test.ts
└── index.ts
```

No React, CLI, provider, filesystem, or network edge belongs in a value library.

## ZORA Extensions

Named repositories:

- `ankhorage/zora-chess`
- `ankhorage/zora-tabletop`

```text
src/
├── components/         # extension-specific ZORA components
├── patterns/           # extension-specific compositions when present
├── metadata/           # authoring metadata when exposed
├── domain/             # portable extension-domain values/logic
└── index.ts
```

Depend on released ZORA APIs rather than deep imports. Extension-specific domain behavior stays here;
general ZORA behavior moves upstream to ZORA first.

## Platform Compatibility

Named repository: `ankhorage/react-native-reanimated-dnd-web`.

```text
src/
├── adapter/            # compatibility/adaptation behavior
├── platform/           # Web/native platform split when required
├── definitions/        # portable public definitions
└── index.ts
```

Keep the compatibility package thin and upstream-oriented; do not turn it into an application
feature owner.

## Orchestrator

Repository: `ankhorage/orchestrator` / `@ankhorage/orchestrator`

Owns module orchestration, desired-state planning, ledgers, and application of independently released
orchestrator modules.

```text
src/
├── modules/            # module contracts/registry/orchestration
├── planning/           # desired-state planning
├── ledger/             # `.ankh/ledger` ownership and reconciliation
├── generation/         # generic generation/application mechanics
├── metadata/           # module/package metadata when exposed
└── index.ts
```

Module-specific generated content belongs in the owning module package, not in Orchestrator core.

## Orchestrator Modules

Named repositories:

- `ankhorage/orchestrator-module-expo-localization`
- `ankhorage/orchestrator-module-expo-google-fonts`

```text
src/
├── definitions/        # module-owned serializable settings when required
├── planning/           # module desired-state planning
├── generation/         # module-owned generated output
├── metadata/           # orchestrator/module registration metadata
└── index.ts
```

A module depends on released Orchestrator contracts/public APIs and owns only its integration.

## Infra

Repository: `ankhorage/infra` / `@ankhorage/infra`

Owns infrastructure desired-state behavior for `manifest.infra`. Application callers pass
`InfraManifest`, not the full `AppManifest`.

```text
src/
├── planning/           # infrastructure desired-state plan
├── providers/          # provider composition/selection
├── adapters/           # provider/tool/process edges
├── metadata/           # serializable capability/provider metadata
├── cli/                # Ankh edge when exposed
└── index.ts
```

Provider packages remain independently releasable. Infra coordinates them through public APIs.

## Deploy

Repository: `ankhorage/deploy` / `@ankhorage/deploy`

Owns app distribution desired-state behavior for `manifest.deploy`. Public behavior receives
`AppDeployManifest`, never the whole `AppManifest` solely to select `deploy`.

```text
src/
├── planning/           # deployment/distribution plan
├── targets/            # target-specific policies
├── adapters/           # EAS/GitHub/store/process edges
├── metadata/           # target/capability metadata
├── cli/                # Ankh deploy edge
└── index.ts
```

Infrastructure deployment remains under Infra; app distribution remains under Deploy.

## Provider Adapters

Named repositories:

- `ankhorage/supabase-auth`
- `ankhorage/supabase-storage`
- `ankhorage/supabase-db`
- `ankhorage/supabase-vault`
- `ankhorage/state-legend`

Canonical family tree:

```text
src/
├── definitions/        # provider-facing portable options/results
├── adapter/            # provider implementation
├── metadata/           # provider registration/capability metadata
├── cli/                # only when the package exposes an Ankh command
└── index.ts
```

Do not recreate the owning generic capability inside a provider package. Provider-specific SDKs and
side effects stay behind the adapter edge.

## Permissions

Repository: `ankhorage/permissions` / `@ankhorage/permissions`

```text
src/
├── definitions/        # portable permission/capability values
├── resolution/         # permission evaluation/resolution
├── adapters/           # platform/provider permission edges
├── metadata/           # authoring/provider metadata when exposed
└── index.ts
```

Keep authorization engine ownership separate from device/platform permission behavior.

## Data Sources

Repository: `ankhorage/data-sources` / `@ankhorage/data-sources`

```text
src/
├── definitions/        # source/query/result contracts owned by the package
├── sources/            # source implementations/adapters
├── bindings/           # source-to-runtime binding helpers when package-owned
├── metadata/           # source authoring metadata
└── index.ts
```

Portable shared serialized data contracts that belong to `AppManifest` remain in Contracts.

## API Gateway

Repository: `ankhorage/api-gateway`.

```text
src/
├── routing/            # API routing policy
├── execution/          # request execution/orchestration
├── adapters/           # transport/provider edges
├── definitions/        # gateway-owned request/result values
└── index.ts
```

Keep the gateway independent of Studio authoring and provider implementations that already have a
standalone package owner.

## Devtools

Repository: `ankhorage/devtools` / `@ankhorage/devtools`

```text
src/
├── cli/                # Devtools command/provider edge
├── tools/              # lint/format/knip/skills/repository policy owners
│   └── skills/
│       └── assets/     # immutable canonical distributed skills
├── repository/         # repository-level policy/synchronization when present
└── index.ts
```

Canonical generated/managed repository files originate here. Do not hand-edit distributed copies as
the source of truth.

## Ankh

Repository: `ankhorage/ankh` / `@ankhorage/ankh`

```text
src/
├── cli/                # executable parsing/dispatch/composition
├── providers/          # provider discovery/loading
├── commands/           # Ankh-owned cross-provider commands only
├── definitions/        # CLI/provider host definitions
└── index.ts
```

Package-specific commands live in their owning provider package. Ankh is the host, not a dumping
ground for another package's capability logic.

## Doctor

Repository: `ankhorage/doctor` / `@ankhorage/doctor`

```text
src/
├── analysis/           # deterministic repository/manifest analyses
├── diagnostics/        # diagnostic definitions/formatting
├── profiles/           # repository/profile readiness policy
├── cli/                # doctor command/provider edge
└── index.ts
```

Doctor reports canonical violations; it does not silently mutate repository state.

## Renovate

Repository: `ankhorage/renovate`.

```text
src/
├── config/             # shared preset/config construction
├── managers/           # custom manager definitions
├── policy/             # dependency/update policy
└── index.ts

.github/workflows/      # Renovate execution/bootstrap workflows
```

Keep organization Renovate policy here; Devtools owns generic repository managed-file policy.

## Paradox

Repository: `ankhorage/paradox` / `@ankhorage/paradox`

```text
src/
├── parsing/            # source/annotation parsing
├── model/              # documentation model
├── generation/         # documentation/diagram generation
├── rendering/          # output renderers
├── cli/                # Paradox command edge
└── index.ts
```

Generated output belongs to consumer repositories; generator implementation belongs here.

## Utility

Repository: `ankhorage/utility` / `@ankhorage/utility`.

Also read [utilities.md](utilities.md).

```text
src/
├── <utility-domain>/   # cohesive reusable utility domains
│   ├── <function>.ts
│   └── <function>.test.ts
└── index.ts            # intentional public exports only
```

One reusable concern per function/module. No application orchestration, provider SDK ownership, or
package-specific compatibility wrapper belongs in Utility.

## Board

Repository: `ankhorage/board`.

```text
src/
├── definitions/        # board/project portable values
├── synchronization/    # board synchronization policy when present
├── adapters/           # GitHub/project-system edge
├── cli/                # command edge when exposed
└── index.ts
```

Board owns organization work-board automation, not generic GitHub repository behavior.

## Naming and standalone descriptions

When a repository is itself a standalone manifest-owned capability, keep repository, package, and
manifest-property nouns aligned where possible (`navigator`, `repository`, `deploy`, `infra`). Its
repository/package description starts with `Standalone` when the package is intentionally usable
outside Studio/generated apps.

Do not name a bounded capability after its current provider executable (`gh`) when the manifest and
public behavior represent a provider-neutral Repository capability.
