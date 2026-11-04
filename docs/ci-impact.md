# Impact-aware CI

The Devtools-managed CI workflow runs an impact planner after the standard install and build gates.
The optimization applies to pull requests only. Pushes to `main`, manual runs, and release
validation are **full runs**. The existing lint, typecheck, formatting, Doctor, APM, Knip, and
Changesets checks are unchanged.

## Unit tests

When `scripts.test` is exactly `bun test`, a source-only PR uses
`bun test --changed=<pull-request-base-sha>`. Bun 1.4 examines transitive static imports to
select affected tests. If a repository uses another runner or an unrecognized test script,
the planner runs `bun run test` without pruning.

Changes to package metadata, lockfiles, global configuration, managed workflows, agent skills,
and setup scripts trigger full tests. Missing or invalid Git history, renames, and removals
also trigger full tests. PRs with documentation-only changes skip unit and smoke suites.
The plan and reasons are published in the GitHub Actions run summary.

## E2E and Smoke

By default, declared `test:e2e`, `test:smoke` and `test:standalone` scripts run in full
on non-documentation PRs. To enable *suite-level* selection, opt into explicit and complete
ownership of every E2E/Smoke suite in `package.json`:

```json
{
  "ankh": {
    "ciImpact": {
      "complete": { "e2e": true, "smoke": true },
      "suites": [
        { "kind": "e2e", "script": "test:e2e:auth", "paths": ["src/features/auth/**", "e2e/auth/**"] },
        { "kind": "e2e", "script": "test:e2e:checkout", "paths": ["src/features/checkout/**", "e2e/checkout/**"] },
        { "kind": "smoke", "script": "test:smoke:auth", "paths": ["src/features/auth/**"] }
      ]
    }
  }
}
```

Every listed script must exist under `scripts`. A mapping supports exact repository-relative
paths and `folder/**` prefixes only. **Complete means exhaustive**, including transitive shared
code and global suite dependencies. If any changed file cannot be assigned, or the manifest is
missing/incomplete, the entire suite family runs rather than being skipped.

Playwright's `--only-changed` is an optional prioritization heuristic, **not proof** that
other E2E scenarios are unaffected. It must not replace complete declarative suite ownership.
Do not automatically run only changed E2E test files as a release gate.

The workflow keeps one `validate` job. Individual test steps show skipped or passed status;
the planner prints the reason, mode, and selected scripts for each family.

## Rollout

After a Devtools release, repository synchronization installs both
`.github/workflows/ci.yml` and `.github/scripts/ci-impact.ts`. Repositories opt into E2E and
Smoke mapping only after their suite ownership has been reviewed and validated in CI.
