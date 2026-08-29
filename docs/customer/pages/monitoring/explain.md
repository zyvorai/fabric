# Explain

## Purpose

Explain — plain-language, AI-generated explanations for a chosen system metric: its current value and trend, an assessment of its status, what's contributing to it, and what to do about it. This is the interpretive layer on top of the raw numbers you'd see in Analytics or Debug Tools.

## When to use it

- When a metric looks off and you want a written explanation of what's driving it, not just the raw number
- To get concrete recommendations for a specific resource (CPU, memory, disk, or network) instead of interpreting a chart yourself
- Before escalating an issue, to see whether the system already has a plausible explanation and fix

## How to get there

- Route / id: `/explain`
- Nav: **Monitoring → Explain** (sidebar, command palette, or desktop nav)

## Operate from the console (UX)

1. **Pick a metric** — four buttons: CPU, Memory, Disk, Network. Selecting one fetches its explanation and its last-hour timeseries; nothing loads until you pick one.
2. **Current Value & Status** — shows the metric's current value with a trend arrow (up/down/flat) and a status badge (e.g. normal, elevated, critical) with a short written summary.
3. **Last Hour chart** — a simple bar chart of the metric's samples over the past hour; hover a bar to see its exact value and time.
4. **Contributing Factors** — a grid of named factors, each with an impact badge (high/medium/low) and a short description of how it's affecting the metric.
5. **Recommendations** — a checklist of suggested actions to address the metric, when the backend provides any.

This page is read-only and doesn't take any action on your behalf — it only explains and recommends.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
