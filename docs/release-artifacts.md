# Artifact-only GitHub Releases

Repositories that do not publish an npm package may opt into the managed artifact-only release lane by committing `.ankh/release-distribution.json`:

```json
{
  "kind": "github-artifact",
  "requiredChecks": ["CI"],
  "versionCommand": ["python3", "scripts/release-version.py"],
  "buildCommand": ["python3", "scripts/build-release.py"],
  "verifyCommand": ["python3", "scripts/check-release.py"],
  "assetPath": "dist/example-plugin.zip",
  "assetName": "example-plugin.zip"
}
```

Each command is an argument array, never a shell string. `requiredChecks` names completed successful GitHub checks for the exact commit; missing, blocked, or failed checks fail closed. The version command must print one stable semantic version. A release is created only when that version is greater than the latest stable `v<version>` tag; unchanged versions are no-release merges. The workflow builds and verifies the exact `main` commit, rejects artifact paths outside the checkout, publishes the asset with SHA-256 and provenance companions, and verifies the downloaded GitHub Release bytes.

This opt-in replaces the npm lane for that repository. It does not run npm publication, npm verification, or package-consumer rollout, and it never deploys the artifact to a site or runtime.
