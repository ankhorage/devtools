# Artifact-only GitHub Releases

Repositories that do not publish an npm package may opt into the managed artifact-only release lane by committing `.ankh/release-distribution.json`:

```json
{
  "kind": "github-artifact",
  "requiredChecks": ["validate"],
  "versionCommand": ["python3", "scripts/release-version.py"],
  "buildCommand": ["python3", "scripts/build-release.py"],
  "verifyCommand": ["python3", "scripts/check-release.py"],
  "assetPath": "dist/example-plugin.zip",
  "assetName": "example-plugin.zip"
}
```

Each command is an argument array, never a shell string: the workflow reads the checked-in descriptor at runtime and executes the arrays with argv semantics. `requiredChecks` contains actual GitHub Check Run names, not workflow names. In the managed CI template the job Check Run is `validate`, whereas `CI` is only the workflow name. A WordPress repository must list the concrete Check Run names it actually protects (for example its `validate` and WordPress integration job names), rather than a generic workflow label. Missing, pending, failed, cancelled, skipped, billing-blocked, incomplete, or otherwise unsuccessful checks for the exact release commit fail closed after bounded polling.

The version command must print one stable semantic version. A release is created only when that version is greater than the latest stable `v<version>` tag; unchanged versions do not upload or replace correct assets. Tags are resolved to commits, so both lightweight and annotated tags are supported. A tag or release target pointing at a different commit is a hard conflict.

New releases are created as drafts. The ZIP, its SHA-256 companion, and its provenance companion are uploaded, downloaded again from GitHub, and byte-for-byte verified before the draft is published. Existing releases are resumed idempotently: correct assets are retained, missing companions are uploaded, and all three assets are downloaded and verified together. A mismatched ZIP, checksum, or provenance is never replaced.

If a tagged release needs recovery after `main` advanced, run the existing Release workflow manually and supply its `v<version>` value as `release_tag`. The workflow resolves that tag to its original commit, reads the descriptor there, and builds and verifies only that checkout. This recovery path is also used automatically when the currently selected version already has a tag.

The default GitHub token has only `checks: read` and `contents: read`. The release-validation GitHub App token requires those same repository-scoped permissions; the separate finalization App token needs only repository-scoped `contents: write`. For private repositories, install both App permissions on the target repository and configure the existing `ANKHORAGE_RENOVATE_SYNC_CLIENT_ID` variable and `ANKHORAGE_RENOVATE_SYNC_PRIVATE_KEY` secret. No token is logged by the generated workflow.

This opt-in replaces the npm lane for that repository. It does not run npm publication, npm verification, or package-consumer rollout, and it never deploys the artifact to a site or runtime.
