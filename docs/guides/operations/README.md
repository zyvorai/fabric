# Operations Guide

This section provides operational procedures for deploying, monitoring, and maintaining Zyvor Fabric in production environments.

## Contents

- **[Operational Checklist](checklist.md)** -- Step-by-step checklists for pre-deployment validation, initial setup (Day 1), and ongoing operations (Day 2+) including disaster recovery procedures.
- **[Monitoring Guide](monitoring.md)** -- How to monitor Zyvor Fabric health, collect metrics, subscribe to real-time events via SSE, configure notification channels, and set up alerting rules.
- **[Backup Strategy](backup-strategy.md)** -- Backup types, automated scheduling with backup policies, retention management, restore workflows, and backup verification practices.

## Operational Philosophy

Zyvor Fabric is designed for systemd-native environments and follows these operational principles:

1. **Systemd-first** -- Zyvor Fabric runs as a systemd service. Use `systemctl` for lifecycle management. VM processes are managed through systemd-machined.
2. **API-driven** -- All operations are available through the REST API. The web UI and CLI are thin clients over the same API surface.
3. **Event-driven observability** -- Real-time SSE event streams and configurable notification channels (Email, Slack, Webhook, Teams) provide immediate visibility into VM lifecycle changes.
4. **Policy-based automation** -- Backup policies, resource quotas, autoscaling rules, and network policies reduce manual intervention.

## Quick Health Check

```bash
# Check daemon status
systemctl status Zyvor Fabric

# API health endpoint
curl -s http://localhost:3000/health | jq

# List running VMs
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"pass"}' | jq -r '.token')
curl -s http://localhost:3000/api/vms \
  -H "Authorization: Bearer $TOKEN" | jq '.total'
```
