# Lifecycle

## Purpose

Lifecycle Manager — define patch/upgrade baselines, scan hosts for compliance against them, remediate non-compliant hosts, and track rolling updates across a host fleet.

## When to use it

- To define a baseline (patch, upgrade, or extension) with a severity level, and see which hosts already meet it
- To scan hosts for compliance against a baseline and find out which are missing patches
- To watch a remediation task apply patches to a host, or a rolling update roll out across a fleet host by host

## How to get there

- Route / id: `/lifecycle`
- Nav: **Operations → Lifecycle** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

Summary tiles show total baselines, non-compliant hosts, active remediation tasks, and currently-running rolling updates. Four tabs:

1. **Baselines** — table of baselines (type, severity, release date, host count, compliant count, and a compliance progress bar). **Create Baseline** sets a name, optional description, type (Patch/Upgrade/Extension), and severity (Critical/Important/Moderate/Low). Per row: the play icon **runs a compliance scan** against that baseline, and the trash icon **deletes it** (confirmation required).
2. **Compliance Scans** — results per host: which baseline it was scanned against, status (compliant / non-compliant / incompatible / etc.), missing patch count, and when it was last scanned.
3. **Remediation** — active and past remediation tasks per host: status, a progress bar, patches applied vs. total, and any error message.
4. **Rolling Updates** — each update plan shown as a card with status, hosts completed vs. total, parallelism (how many hosts update at once), the host currently being updated, a progress bar, start/completion timestamps, and a failed-host count if any.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
