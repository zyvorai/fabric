# vmspawn Guides

This directory contains practical guides for installing, operating, and making informed decisions about vmspawn.

## Guide Categories

### [CLI Guide](cli/)

Command-line interface reference and API usage guide for interacting with the vmspawn REST API.

- **[API Reference](cli/api-reference.md)** -- Complete REST API reference with 480+ endpoints organized by category. Includes request/response formats, authentication details, and curl examples for every endpoint group.

### [Operations Guide](operations/)

Day-to-day operational procedures for running vmspawn in production environments.

- **[Operational Checklist](operations/checklist.md)** -- Pre-deployment, Day 1, and Day 2 operational checklists covering installation verification, initial configuration, monitoring setup, backup schedules, and disaster recovery procedures.
- **[Monitoring Guide](operations/monitoring.md)** -- Health checks, metrics collection, SSE event streaming, notification channel configuration (Email, Slack, Webhook, Teams), and alerting best practices.
- **[Backup Strategy](operations/backup-strategy.md)** -- Backup types (full and incremental), policy-based scheduling, retention management, restore procedures, and backup verification workflows.

### [Decision Support](decision-support/)

Evaluation materials for comparing vmspawn against alternative virtualization platforms.

- **[Comparison Matrix](decision-support/comparison-matrix.md)** -- Feature-by-feature comparison of vmspawn against libvirt/virsh, Proxmox VE, and other VM management tools, with a focus on systemd integration, API completeness, and operational model differences.

## Related Documentation

- **[Reference Documentation](../reference/)** -- Detailed API specifications, data model definitions, and protocol documentation.
- **[Architecture Overview](../architecture.md)** -- System architecture and component design.
- **[Security Audit Report](../SECURITY_AUDIT_REPORT.md)** -- Security review findings and hardening measures.
