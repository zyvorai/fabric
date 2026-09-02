# Operations Guide

This section provides operational procedures for deploying, monitoring, and maintaining Zyvor Fabric in production environments.

## Contents

- **[Operational Checklist](checklist.md)** -- Step-by-step checklists for pre-deployment validation, initial setup (Day 1), and ongoing operations (Day 2+) including disaster recovery procedures.
- **[Monitoring Guide](monitoring.md)** -- How to monitor Zyvor Fabric health, collect metrics, subscribe to real-time events via SSE, configure notification channels, and set up alerting rules.
- **[Backup Strategy](backup-strategy.md)** -- Backup types, automated scheduling with backup policies, retention management, restore workflows, and backup verification practices.

## Operational Philosophy

Zyvor Fabric follows these operational principles:

1. **No systemd dependency** -- `zyvor-fabricd` can run as a systemd service (use `systemctl` for lifecycle management if so) or under any other supervisor, or in the foreground -- nothing in packaging requires systemd. VM processes are managed by [FluxVM](https://github.com/zyvorai/fluxvm), a disposable-VM engine with no systemd dependency of its own -- see the [FluxVM driver guide](../vm-drivers/fluxvm.md) for its capability matrix and known gaps.
2. **API-driven** -- All operations are available through the REST API. The web UI and CLI are thin clients over the same API surface.
3. **Event-driven observability** -- Real-time SSE event streams and configurable notification channels (Email, Slack, Webhook, Teams) provide immediate visibility into VM lifecycle changes.
4. **Policy-based automation** -- Backup policies, resource quotas, autoscaling rules, and network policies reduce manual intervention.

## Quick Health Check

```bash
# Check daemon status (if running under systemd)
systemctl status zyvor-fabricd
# Or, regardless of how it's supervised:
curl -s http://localhost:9095/health

# API health endpoint
curl -s http://localhost:3000/health | jq

# List running VMs
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"pass"}' | jq -r '.token')
curl -s http://localhost:3000/api/vms \
  -H "Authorization: Bearer $TOKEN" | jq '.total'
```
