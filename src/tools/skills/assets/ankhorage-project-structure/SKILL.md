---
name: ankhorage-project-structure
description: >
  Design, review, or migrate the source structure of Ankhorage repositories and generated
  applications. Use for directory ownership, package boundaries, package CLI layout, repository
  skill distribution, public entrypoints, or cross-repository cleanup.
---

# Ankhorage Project Structure

Apply the universal ownership rules, then load the structure reference for the **named repository**.
Known Ankhorage platform repositories have canonical structures; do not invent a new taxonomy from
a generic profile when the repository is listed below.

Before deciding structure:

1. Read the repository `AGENTS.md`, `package.json`, exports, source tree, and representative tests.
2. Load `ankhorage-coding-rules` as the complementary implementation and testing authority.
3. Identify the repository's owning capability and its row in the routing table.
4. Read the routed reference before moving, adding, or exposing source.
5. Identify current public subpaths and cross-package release boundaries.

Repository-specific rules may refine this skill, but must not silently reverse package ownership or
dependency direction.

## Primary boundary

An Ankhorage repository/package is the primary bounded capability and independently released unit.
Do not force a Studio directory tree onto libraries, providers, tooling, or generated applications.

- Independently bindable capabilities belong in standalone packages.
- Substantial responsibilities inside a package use cohesive directories owned by the package.
- Cross-package access uses published APIs and declared dependencies, never sibling source.
- A package owns its application behavior; adapters belonging to another package are not copied or
  proxied locally.

## Named repository routing

Read [repositories.md](references/repositories.md) for the concrete tree and ownership rules unless
a more specific reference is named below. Every repository in this table is intentional; physical
pre-rename aliases are not parallel capabilities.

| Repository | Canonical structure reference |
| --- | --- |
| `ankhorage/studio` | [studio.md](references/studio.md) |
| `ankhorage/runtime` | [repositories.md#runtime](references/repositories.md#runtime) |
| `ankhorage/contracts` | [repositories.md#contracts](references/repositories.md#contracts) |
| `ankhorage/templates` | [repositories.md#templates](references/repositories.md#templates) |
| `ankhorage/navigator` | [repositories.md#navigator](references/repositories.md#navigator) |
| `ankhorage/repository` | [repositories.md#repository](references/repositories.md#repository) |
| `ankhorage/zora` | [repositories.md#zora](references/repositories.md#zora) |
| `ankhorage/surface` | [repositories.md#surface](references/repositories.md#surface) |
| `ankhorage/expo-runtime` | [repositories.md#expo-runtime](references/repositories.md#expo-runtime) |
| `ankhorage/color-theory` | [repositories.md#value-libraries](references/repositories.md#value-libraries) |
| `ankhorage/zora-chess` | [repositories.md#zora-extensions](references/repositories.md#zora-extensions) |
| `ankhorage/zora-tabletop` | [repositories.md#zora-extensions](references/repositories.md#zora-extensions) |
| `ankhorage/react-native-reanimated-dnd-web` | [repositories.md#platform-compatibility](references/repositories.md#platform-compatibility) |
| `ankhorage/orchestrator` | [repositories.md#orchestrator](references/repositories.md#orchestrator) |
| `ankhorage/orchestrator-module-expo-localization` | [repositories.md#orchestrator-modules](references/repositories.md#orchestrator-modules) |
| `ankhorage/orchestrator-module-expo-google-fonts` | [repositories.md#orchestrator-modules](references/repositories.md#orchestrator-modules) |
| `ankhorage/infra` | [repositories.md#infra](references/repositories.md#infra) |
| `ankhorage/deploy` | [repositories.md#deploy](references/repositories.md#deploy) |
| `ankhorage/supabase-auth` | [repositories.md#provider-adapters](references/repositories.md#provider-adapters) |
| `ankhorage/supabase-storage` | [repositories.md#provider-adapters](references/repositories.md#provider-adapters) |
| `ankhorage/supabase-db` | [repositories.md#provider-adapters](references/repositories.md#provider-adapters) |
| `ankhorage/supabase-vault` | [repositories.md#provider-adapters](references/repositories.md#provider-adapters) |
| `ankhorage/state-legend` | [repositories.md#provider-adapters](references/repositories.md#provider-adapters) |
| `ankhorage/permissions` | [repositories.md#permissions](references/repositories.md#permissions) |
| `ankhorage/data-sources` | [repositories.md#data-sources](references/repositories.md#data-sources) |
| `ankhorage/api-gateway` | [repositories.md#api-gateway](references/repositories.md#api-gateway) |
| `ankhorage/devtools` | [repositories.md#devtools](references/repositories.md#devtools) |
| `ankhorage/ankh` | [repositories.md#ankh](references/repositories.md#ankh) |
| `ankhorage/doctor` | [repositories.md#doctor](references/repositories.md#doctor) |
| `ankhorage/renovate` | [repositories.md#renovate](references/repositories.md#renovate) |
| `ankhorage/paradox` | [repositories.md#paradox](references/repositories.md#paradox) |
| `ankhorage/utility` | [repositories.md#utility](references/repositories.md#utility) and [utilities.md](references/utilities.md) |
| `ankhorage/board` | [repositories.md#board](references/repositories.md#board) |

While `ankhorage/gh` still physically exists, treat it only as the pending physical name of the
canonical `ankhorage/repository` capability and route it to the Repository section. Do not create a
separate `gh` architecture.

Product/customer repositories and archived historical repositories are outside this shared package
map unless they are deliberately brought into scope.

## Manifest-slice boundary

Standalone owners of `AppManifest` subtrees receive **only their owned serialized slice**, never the
whole `AppManifest` merely to select a property:

```text
manifest.infra       -> InfraManifest        -> Infra owner
manifest.deploy      -> AppDeployManifest    -> @ankhorage/deploy
manifest.navigator   -> AppNavigatorManifest -> @ankhorage/navigator
manifest.repository  -> RepositoryManifest   -> @ankhorage/repository
```

- Callers extract the slice before crossing the package boundary.
- Public APIs accept the slice or directly related portable contract types.
- Do not introduce `{ manifest: AppManifest }` wrappers into a standalone capability.
- Contracts owns serialized shapes and structural validation; capability packages own behavior.
- Contracts must never depend outward on the capability package.
- Add source/import regression coverage when a capability is at risk of whole-manifest coupling.

When a package declares an Ankh provider or changes `src/cli/`, always read
[cli.md](references/cli.md).

When classifying a local or cross-repository utility, also read
[utilities.md](references/utilities.md).

When the task is a structural cleanup or migration, also read
[migration.md](references/migration.md).

When adding, distributing, or synchronizing repository-local agent skills, read
[skill-distribution.md](references/skill-distribution.md).

## Universal invariants

- Keep only intentional package entrypoints and required declaration shims directly under `src/`.
- Keep one abstraction level and responsibility among siblings.
- Prefer domain ownership over technical dumping grounds such as `common`, `core`, `helpers`,
  `misc`, or `shared`. `utils/` is the canonical local directory for genuine package-level
  utilities.
- Colocate focused unit tests. Put cross-domain acceptance, E2E, smoke infrastructure, and large
  fixtures outside production source.
- Public package subpaths may point to nested source. Do not keep files at `src/` merely because they
  are exported.
- Preserve one canonical implementation. Do not add legacy paths, compatibility barrels, or
  duplicate APIs to make a migration appear smaller.
- A documented canonical tree defines ownership. Do not create empty directories solely to mirror
  the diagram; create the directory when its responsibility exists.

## Ownership decision

For every file or new symbol, decide in order:

1. Which Ankhorage package owns the capability?
2. Which internal domain in the routed repository tree owns it?
3. Is it core policy, application orchestration, a required port, an edge adapter, composition, or
   a public entrypoint?
4. Is it reusable enough to belong in `@ankhorage/utility` instead?

If any answer is unclear, resolve ownership before moving or creating code.
