# Monitoring Guide

How to monitor vmspawn health, collect metrics, subscribe to real-time events, and configure alerting.

## Table of Contents

- [Health Endpoint](#health-endpoint)
- [Metrics Collection](#metrics-collection)
- [Event Stream (SSE)](#event-stream-sse)
- [Notification Channels](#notification-channels)
- [Alert Configuration](#alert-configuration)
- [Webhook Retry Policies](#webhook-retry-policies)

---

## Health Endpoint

The `/health` endpoint provides a quick liveness check for the vmspawnd service. It does not require authentication.

```bash
curl -s http://localhost:3000/health | jq
```

**Response:**

```json
{
  "status": "ok"
}
```

### Integration with Monitoring Systems

**systemd watchdog:**

vmspawnd integrates with systemd's watchdog mechanism. If the process becomes unresponsive, systemd will automatically restart it.

**HTTP health probes:**

Configure your monitoring system to poll `/health` every 30-60 seconds:

```yaml
# Prometheus blackbox exporter example
modules:
  vmspawn_health:
    prober: http
    http:
      valid_http_versions: ["HTTP/1.1", "HTTP/2"]
      valid_status_codes: [200]
      method: GET
      preferred_ip_protocol: "ip4"

# Target
- targets:
  - http://vmspawn-host:3000/health
```

**Load balancer health check:**

```nginx
# nginx upstream health check
upstream vmspawn {
    server 127.0.0.1:3000;
    # Check health every 5 seconds
}

location /health {
    proxy_pass http://vmspawn;
    proxy_connect_timeout 2s;
    proxy_read_timeout 2s;
}
```

---

## Metrics Collection

### Host Resource Stats

Poll the system resource stats endpoint to track host-level capacity:

```bash
curl -s http://localhost:3000/api/system/resource-stats \
  -H "Authorization: Bearer $TOKEN" | jq
```

Key metrics to track:

| Metric | Source | Alert Threshold |
|--------|--------|-----------------|
| Host CPU utilization | `/api/system/resource-stats` | > 85% sustained |
| Host memory utilization | `/api/system/resource-stats` | > 90% |
| Disk I/O latency | `/api/system/resource-stats` | > 10ms average |
| Available hugepages | `/api/system/hugepages` | < 10% of allocated |

### Per-VM Metrics

Collect metrics for each VM:

```bash
# Get metrics for a specific VM
curl -s http://localhost:3000/api/vms/web-server/metrics \
  -H "Authorization: Bearer $TOKEN" | jq
```

Useful per-VM metrics:

| Metric | Field | Description |
|--------|-------|-------------|
| CPU usage | `cpu_usage_percent` | vCPU utilization percentage |
| Memory used | `memory_used_bytes` | Current memory consumption |
| Memory total | `memory_total_bytes` | Allocated memory limit |
| Disk reads | `disk_read_bytes` | Cumulative bytes read |
| Disk writes | `disk_write_bytes` | Cumulative bytes written |
| Network RX | `network_rx_bytes` | Cumulative bytes received |
| Network TX | `network_tx_bytes` | Cumulative bytes transmitted |

### Collection Script Example

```bash
#!/bin/bash
# collect-metrics.sh -- Run via cron every minute
HOST="http://localhost:3000"
TOKEN="$(cat /etc/vmspawnd/api-token)"
AUTH="Authorization: Bearer $TOKEN"

# Host stats
curl -s "$HOST/api/system/resource-stats" -H "$AUTH" \
  >> /var/log/vmspawnd/host-metrics.jsonl

# Per-VM stats
for vm in $(curl -s "$HOST/api/vms" -H "$AUTH" | jq -r '.items[].name'); do
  echo "{\"timestamp\":\"$(date -Is)\",\"vm\":\"$vm\",\"metrics\":$(curl -s "$HOST/api/vms/$vm/metrics" -H "$AUTH")}" \
    >> /var/log/vmspawnd/vm-metrics.jsonl
done
```

### Backup Health Metrics

Monitor backup system health:

```bash
# Backup statistics
curl -s http://localhost:3000/api/backups/stats \
  -H "Authorization: Bearer $TOKEN" | jq

# Check for failed backup jobs
curl -s http://localhost:3000/api/backups/jobs \
  -H "Authorization: Bearer $TOKEN" | jq '[.[] | select(.status == "failed")]'
```

---

## Event Stream (SSE)

The SSE endpoint provides real-time notification of all VM lifecycle events. This is the primary mechanism for building reactive monitoring and automation.

### Connecting

```bash
curl -N http://localhost:3000/api/events/stream \
  -H "Authorization: Bearer $TOKEN"
```

### Event Format

Each event follows the SSE specification:

```
event: vm.started
id: 550e8400-e29b-41d4-a716-446655440000
data: {"id":"550e8400...","event_type":"started","vm_name":"my-vm","detail":null,"timestamp":"2026-04-12T10:00:00Z"}

```

### Event Types

| Event Type | Description |
|------------|-------------|
| `created` | New VM created |
| `started` | VM started successfully |
| `stopped` | VM stopped |
| `paused` | VM paused (frozen) |
| `resumed` | VM resumed from pause |
| `deleted` | VM deleted |
| `cloned` | VM cloned |
| `migrated` | VM migrated |
| `snapshot_created` | Snapshot taken |
| `snapshot_reverted` | VM reverted to snapshot |
| `cpu_hotplug` | CPU added/removed while running |
| `memory_hotplug` | Memory added/removed while running |
| `disk_attached` | Disk attached to VM |
| `disk_detached` | Disk detached from VM |
| `error` | Error occurred (detail field contains message) |
| `auto_healed` | Automatic recovery action taken |

### Consuming Events Programmatically

**Python example:**

```python
import requests
import json

url = "http://localhost:3000/api/events/stream"
headers = {"Authorization": f"Bearer {token}"}

with requests.get(url, headers=headers, stream=True) as response:
    for line in response.iter_lines():
        if line and line.startswith(b"data:"):
            event = json.loads(line[5:])
            if event["event_type"] == "error":
                send_alert(event)
```

### Behavior Notes

- The server sends periodic keep-alive comments (`:` lines) to prevent connection timeouts.
- If a client falls behind, the server sends a comment indicating how many events were missed: `missed N events`.
- Events are persisted to disk and pruned automatically (retains the most recent 1000 events).
- The `GET /api/events` endpoint returns the 100 most recent stored events for clients that need to catch up after reconnecting.

---

## Notification Channels

vmspawn supports four notification channel types for delivering alerts to external systems.

### Channel Types

| Type | Use Case | Required Config |
|------|----------|-----------------|
| **Email** | Operational alerts to team inboxes | `smtp_server`, `from`, `to` |
| **Slack** | Real-time alerts in Slack channels | `webhook_url` |
| **Webhook** | Integration with custom systems | `url` |
| **Teams** | Microsoft Teams notifications | `webhook_url` |

### Creating Channels

```bash
# Email channel
curl -s -X POST http://localhost:3000/api/notifications/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ops-email",
    "type": "email",
    "config": {
      "smtp_server": "smtp.company.com:587",
      "from": "vmspawn@company.com",
      "to": "ops-team@company.com",
      "username": "vmspawn",
      "password": "smtp-password"
    },
    "enabled": true
  }' | jq

# Slack channel
curl -s -X POST http://localhost:3000/api/notifications/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ops-slack",
    "type": "slack",
    "config": {
      "webhook_url": "https://hooks.slack.com/services/T.../B.../..."
    },
    "enabled": true
  }' | jq

# Generic webhook
curl -s -X POST http://localhost:3000/api/notifications/channels \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "pagerduty",
    "type": "webhook",
    "config": {
      "url": "https://events.pagerduty.com/v2/enqueue",
      "headers": {"X-Routing-Key": "YOUR_ROUTING_KEY"}
    },
    "enabled": true
  }' | jq
```

### Testing Channels

Always test a channel after creation to verify connectivity:

```bash
curl -s -X POST http://localhost:3000/api/notifications/channels/<channel-id>/test \
  -H "Authorization: Bearer $TOKEN" | jq
```

---

## Alert Configuration

Notification rules define which events trigger notifications and which channels receive them.

### Rule Structure

Each rule specifies:

- **Event types** -- Which VM events trigger the rule (e.g., `error`, `stopped`)
- **Severity levels** -- Minimum severity: `info`, `warning`, `critical`
- **Channels** -- Which notification channels receive the alert
- **VM tags** -- Optional filter to scope alerts to VMs with specific tags
- **Enabled** -- Whether the rule is active

### Example Rules

**Critical failures (all VMs):**

```bash
curl -s -X POST http://localhost:3000/api/notifications/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "all-critical",
    "description": "Alert on any VM error or unexpected stop",
    "event_types": ["error", "auto_healed"],
    "severity_levels": ["critical"],
    "channels": ["slack-channel-id", "email-channel-id"],
    "enabled": true
  }' | jq
```

**Production VM lifecycle events:**

```bash
curl -s -X POST http://localhost:3000/api/notifications/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "prod-lifecycle",
    "description": "Track lifecycle of production VMs",
    "event_types": ["started", "stopped", "created", "deleted"],
    "severity_levels": ["info", "warning"],
    "channels": ["slack-channel-id"],
    "vm_tags": ["production"],
    "enabled": true
  }' | jq
```

### Monitoring Rule Effectiveness

```bash
# Check how many times each rule has fired
curl -s http://localhost:3000/api/notifications/rules \
  -H "Authorization: Bearer $TOKEN" | jq '.[] | {name, triggered_count, last_triggered}'
```

---

## Webhook Retry Policies

When a webhook delivery fails, vmspawn automatically retries with exponential backoff.

### Retry Behavior

| Parameter | Value |
|-----------|-------|
| Maximum retry attempts | 10 |
| Backoff strategy | Exponential |
| Stored payload size | First 4 KB (truncated) |

### Monitoring Deliveries

```bash
# List all webhook deliveries (recent)
curl -s http://localhost:3000/api/notifications/webhooks/deliveries \
  -H "Authorization: Bearer $TOKEN" | jq

# Filter for failed deliveries
curl -s http://localhost:3000/api/notifications/webhooks/deliveries \
  -H "Authorization: Bearer $TOKEN" | jq '[.[] | select(.status == "failed")]'
```

### Delivery Status Values

| Status | Description |
|--------|-------------|
| `pending` | Queued for first delivery attempt |
| `delivered` | Successfully delivered |
| `retrying` | Failed, waiting for next retry attempt |
| `failed` | Exhausted all retry attempts |

### Troubleshooting Failed Deliveries

1. Check the `error` field for the failure reason (connection refused, timeout, non-2xx status)
2. Check the `response_code` field for HTTP status from the remote endpoint
3. Verify the channel URL is correct and the remote endpoint is accessible from the vmspawn host
4. Test the channel manually: `POST /api/notifications/channels/:id/test`
