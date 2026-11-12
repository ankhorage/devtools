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

Each command is an argument array, never a shell string: the workflow reads the checked-in descriptor at runtime and executes the arrays with argv semantics. `requiredChecks` contains actual GitHub Check Run names, not workflow names. In the managed CI template the job Check Run is `validate`, whereas `CI` is only the workflow name. A WordPress repository must list the concrete Check Run names it actually protects (for example its `validate` and WordPress integration job names), rather than a generic workflow label. Missing, pending, failed, cancelled, skipped, billing-blocked, or otherwise unsuccessful checks for the exact release commit fail closed after bounded polling. The version command must print one stable semantic version. A release is created only when that version is greater than the latest stable `v<version>` tag; unchanged versions are no-release merges. If a tag already exists at the release SHA, finalization checks out that original commit even after `main` has advanced. The workflow rejects artifact paths outside the checkout, publishes portable SHA-256 and provenance companions, and verifies all downloaded GitHub Release bytes and companion contents.

This opt-in replaces the npm lane for that repository. It does not run npm publication, npm verification, or package-consumer rollout, and it never deploys the artifact to a site or runtime.
