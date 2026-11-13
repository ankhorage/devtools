# Artifact-only GitHub Releases

Repositories that do not publish an npm package may opt into the managed artifact-only release lane by committing `.ankh/release-distribution.json`:

```json
{
  "kind": "github-artifact",
  "requiredChecks": ["validate"],
  "requiredWorkflow": ".github/workflows/ci.yml",
  "versionCommand": ["python3", "scripts/release-version.py"],
  "buildCommand": ["python3", "scripts/build-release.py"],
  "verifyCommand": ["python3", "scripts/check-release.py"],
  "assetPath": "dist/example-plugin.zip",
  "assetName": "example-plugin.zip"
}
```

Each command is an argument array, never a shell string: the workflow reads the checked-in descriptor at runtime and executes the arrays with argv semantics. `requiredChecks` contains actual GitHub Check Run names, not workflow names. `requiredWorkflow` names the checked-in workflow file that owns those checks. In the managed CI template the job Check Run is `validate`, whereas `CI` is only the workflow name. A WordPress repository must list the concrete Check Run names it actually protects (for example its `validate` and WordPress integration job names), rather than a generic workflow label. Every required check must link through its Check Suite to exactly one successful run of `requiredWorkflow`, triggered by a `push` to `refs/heads/main` for the exact release commit. Missing, pending, failed, cancelled, skipped, billing-blocked, ambiguous, incomplete, or otherwise untrusted provenance fails closed after bounded polling.

The version command must print one stable semantic version. A release is created only when that version is greater than the latest stable `v<version>` tag; unchanged versions do not upload or replace correct assets. Tags are resolved to commits, so both lightweight and annotated tags are supported. A tag or release target pointing at a different commit is a hard conflict.

New releases are created as drafts. Finalization resolves `GET /repos/{owner}/{repo}/releases/tags/{tag}` first, requires its numeric release ID, then retrieves every page through `GET /repos/{owner}/{repo}/releases/{release_id}/assets`. Any API error, incomplete response, malformed entry, or duplicate managed asset name fails closed; none is interpreted as a missing asset. The ZIP, its SHA-256 companion, and its provenance companion are uploaded, downloaded again from GitHub, and byte-for-byte verified before the draft is published. Existing releases are resumed idempotently: correct assets are retained, missing companions are uploaded, and all three assets are downloaded and verified together. A mismatched ZIP, checksum, or provenance is never replaced.

If a tagged release needs recovery after `main` advanced, run the existing Release workflow manually and supply its `v<version>` value as `release_tag`. The workflow requires that tag to resolve uniquely to a commit (for either lightweight or annotated tags), reads the descriptor at that original commit, and builds and verifies only that checkout. Explicit recovery does not compare the old version against later releases; a new release still rejects a lower unused version and never overwrites a tag that points elsewhere. This recovery path is also used automatically when the currently selected version already has a tag.

The default GitHub token has only `checks: read` and `contents: read`. The release-validation GitHub App token requires those same repository-scoped permissions; the separate finalization App token needs only repository-scoped `contents: write`. For private repositories, install both App permissions on the target repository and configure the existing `ANKHORAGE_RENOVATE_SYNC_CLIENT_ID` variable and `ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY` secret. No token is logged by the generated workflow.

This opt-in replaces the npm lane for that repository. It does not run npm publication, npm verification, or package-consumer rollout, and it never deploys the artifact to a site or runtime.

Devtools exercises the generated lifecycle in an isolated fixture. It uses a local Git history with annotated tags and an advanced main branch, creates a real ZIP, runs the generated selection and build scripts, and substitutes only the `gh` CLI boundary with a stateful fixture. The fixture proves draft creation, upload, download, byte verification, publish, partial recovery, idempotent resume, and fail-closed release-API errors. It does not create GitHub releases, repository tags, or App tokens in a live private repository; those permissions remain configuration and CI-environment responsibilities.
