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
on non-documentation PRs. To enable _suite-level_ selection, opt into explicit and complete
ownership of every E2E/Smoke suite in `package.json`:

```json
{
  "ankh": {
    "ciImpact": {
      "complete": { "e2e": true, "smoke": true },
      "suites": [
        {
          "kind": "e2e",
          "script": "test:e2e:auth",
          "paths": ["src/features/auth/**", "e2e/auth/**"]
        },
        {
          "kind": "e2e",
          "script": "test:e2e:checkout",
          "paths": ["src/features/checkout/**", "e2e/checkout/**"]
        },
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

## External workflow jobs

`@ankhorage/devtools` publishes the planner as both the `@ankhorage/devtools/ci-impact`
subpath and the `ankhorage-ci-impact` binary. Separate workflows use the binary after their
normal frozen dependency installation; they do not copy the planner or import Devtools source:

```yaml
jobs:
  impact:
    runs-on: ubuntu-latest
    outputs:
      impact: ${{ steps.plan.outputs.impact }}
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - run: bun install --frozen-lockfile
      - id: plan
        env:
          ANKH_CI_BASE_SHA: ${{ github.event.pull_request.base.sha }}
        run: ankhorage-ci-impact plan

  acceptance-account:
    needs: impact
    if: fromJSON(needs.impact.outputs.impact).jobs['test:e2e:account'].state != 'skipped'
    runs-on: ubuntu-latest
    steps:
      - run: bun run test:e2e:account
```

The `impact` output is one JSON line that cannot interpolate repository values into a shell.
Its versioned shape is `{ version, plan, jobs }`; each key in `jobs` is a fully declared
`ankh.ciImpact.suites[].script` and has `state` (`selected`, `skipped`, or `full`), `reason`,
and `fallback`. A `full` decision always has `fallback: true`; it is emitted for unavailable
or unsafe diffs, global/tooling/configuration/lockfile changes, invalid declarations, and
unmapped or overlapping ownership. The existing `unit`, `e2e`, and `smoke` scalar outputs remain
available to the managed workflow.

A skipped conditional job is neither an implicit successful test nor a suitable required branch
check. Keep an always-running, non-pruned validation or aggregation job as the required check;
make individual conditional suite jobs informational. This preserves a visible status for every
intentional skip and prevents branch protection from treating a missing job as evidence.

## Rollout

After a Devtools release, repository synchronization installs both
`.github/workflows/ci.yml` and `.github/scripts/ci-impact.ts`. Repositories opt into E2E and
Smoke mapping only after their suite ownership has been reviewed and validated in CI.
