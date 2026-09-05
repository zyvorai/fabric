# Repository governance

Checklist for protecting `main` and shipping releases on `zyvorai/fabric`
(and optionally `ssahani/zyvor-fabric`).

## Branch protection (ruleset)

Preferred: GitHub **Rulesets** (Settings → Rules → Rulesets).

Minimum for `refs/heads/main`:

| Rule | Value |
|------|--------|
| Restrict deletions | on |
| Block force pushes | on |
| Require a pull request | on (prefer ≥1 approval) |
| Require status checks | `test`, `web` (add `e2e`, `security` when stable) |
| Require conversation resolution | optional |

Apply via UI or API (`POST /repos/{owner}/{repo}/rulesets`). Org/admin
permission is required; if the API returns 403, use the UI with this
checklist.

Verify:

```bash
gh api repos/zyvorai/fabric/rulesets --jq '.[].name'
```

## CODEOWNERS

See [`.github/CODEOWNERS`](../.github/CODEOWNERS). Currently lists
`@hypersdk` and `@ssahani`; switch to `@zyvorai/fabric-maintainers`
when that team exists. Enable “Require review from Code Owners” on the
ruleset when ready.

## Required checks (job names)

| Workflow | Job id (context) | When to require |
|----------|------------------|----------------|
| `ci.yml` | `test` | immediately |
| `ci.yml` | `web` | immediately |
| `fabric-e2e.yml` | `e2e` | after first green week |
| `security.yml` | `cargo-deny` / CodeQL | after first green week |

## Releases

- Prefer annotated tags (`vX.Y.Z`) created from `main` after green CI.
- Product release workflow (`.github/workflows/release.yml`) builds
  binaries, SBOM, Helm chart, and publishes a GitHub Release.
- Prefer signed tags when maintainers have GPG/SSH signing configured.
