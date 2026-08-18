# Security Dashboard

## Purpose

Security — a real-time security posture and threat-monitoring view: an overall risk score, active security alerts, recent failed login attempts, and listening network ports on the host. Data auto-refreshes every 5 seconds. This is distinct from [Compliance](compliance.md) (configuration checks) and [Certificates](certificates.md) (PKI health) — this page is about live threats and activity, not point-in-time audits.

## When to use it

- To get a fast read on overall risk from the single risk-score gauge
- To see currently active security alerts by severity (critical/warning/info)
- To spot a brute-force or credential-stuffing attempt via the failed-logins table
- To audit which ports are open and listening on the host, and which process owns each one

## How to get there

- Route / id: `/security-dashboard`
- Nav: **Security → Security Dashboard** (sidebar, command palette, or desktop nav)

## What you can do

1. View the risk score gauge (0-100, color-coded) alongside Critical Alerts, Warnings, and Failed Logins count tiles.
2. Review the Security Alerts list — severity badge, message, source, and timestamp per alert; shows "No active alerts" when clear.
3. Review the Failed Logins table (time, user, source) — only appears when there are failed attempts to report.
4. Review the Listening Ports table (port, protocol, process, PID) — only appears when the host has ports open.
5. Data refreshes automatically every 5 seconds; a manual refresh is also available from the page header.

If the page stays empty, check service health, auth configuration, and that dependencies for this domain are installed.

## Related pages

- [Getting Started](../../getting-started.md)
- [Page index](../../PAGE_INDEX.md)
