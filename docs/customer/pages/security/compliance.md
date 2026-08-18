# Compliance

## Purpose

Compliance Dashboard — a security and configuration compliance scorecard: an overall score, pass/warning/fail counts by category, and remediation guidance for anything that isn't passing.

## When to use it

- To get a single number for how compliant your deployment currently is
- To find exactly which checks are failing or warning, and how to fix each one
- To trigger a fresh compliance scan on demand instead of waiting for the next one
- To narrow the check list down to one category, e.g. only network or only auth checks

## How to get there

- Route / id: `/compliance`
- Nav: **Security → Compliance** (sidebar, command palette, or desktop nav)

## What you can do

1. View the compliance score (0-100, color-coded green/amber/red) alongside Passed, Warnings, Failed, and Total Checks tiles.
2. Click **Run Scan** to trigger a fresh compliance scan — the button reads "Scanning…" while it runs, and the dashboard refreshes with the new results when it completes.
3. Filter checks by category using the pill buttons (**all**, plus each category returned by the last scan).
4. Review each check's name, status (pass/warning/fail), and description; anything not passing shows a "Fix:" remediation note inline.
5. See when the data was last collected via the "Last scan" timestamp at the bottom of the page.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
