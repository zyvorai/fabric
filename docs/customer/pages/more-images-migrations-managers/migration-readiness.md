# Readiness

## Purpose

Migration Readiness — pre-flight checks that verify the environment is in a good state before you start a migration, with a pass/fail summary and per-check detail.

## When to use it

- Before kicking off a migration, to confirm the environment is actually ready
- To see how many errors vs. warnings are blocking readiness before digging in
- To read the specific message (and detail line) behind a failing or warning check

## How to get there

- Route / id: `/migration-readiness`
- Nav: **More — images, migrations & managers → Readiness** (sidebar, command palette, or desktop nav)

## What you can do

1. The page runs readiness checks as soon as you open it; use the header **Refresh** control to re-run them.
2. A summary banner at the top reads either **Ready for Migration** (all checks passed) or **Issues Found**, with a count of errors and warnings.
3. Below it, every individual check is listed with a status icon (green check / yellow warning / red x), its name, a short message, an optional monospace detail line, and a status badge.
4. This page is read-only — it reports state but doesn't fix anything; resolve issues elsewhere, then come back and refresh.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
