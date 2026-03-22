# vmspawnd REST API Documentation

## Base URL

```
http://localhost:8080/api
```

## Authentication

Most endpoints require a valid JWT token passed via the `Authorization` header:

```
Authorization: Bearer <token>
```

**Obtain a token:**

```bash
# Read the auto-generated admin password (first startup)
PASSWORD=$(sudo cat /var/lib/vmspawnd/.admin_password)

# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\": \"admin\", \"password\": \"$PASSWORD\"}"
```

Unauthenticated requests receive a `401 Unauthorized` response. The `/api/auth/login` and `/health` endpoints are accessible without authentication. When auth is disabled in config, all endpoints are accessible without a token.

## Overview

The API exposes 480+ REST endpoints and 3 WebSocket endpoints organized into the categories below. This document lists the key endpoints in each category. All request and response bodies use JSON.

---

## Auth

User authentication and session management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/login` | Authenticate and obtain a token |
| POST | `/auth/logout` | Invalidate the current token |
| POST | `/auth/refresh` | Refresh an expiring token |
| GET | `/auth/me` | Get the current authenticated user |
| POST | `/auth/users` | Create a new user |
| GET | `/auth/users` | List users |
| PUT | `/auth/users/:id` | Update a user |
| DELETE | `/auth/users/:id` | Delete a user |
| POST | `/auth/roles` | Create a role |
| GET | `/auth/roles` | List roles |

## VM Management

Core virtual machine lifecycle operations.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vms` | List all VMs |
| POST | `/vms` | Create a new VM |
| GET | `/vms/:name` | Get VM details |
| DELETE | `/vms/:name` | Delete a VM |
| POST | `/vms/:name/start` | Start a VM |
| POST | `/vms/:name/stop` | Stop a VM |
| POST | `/vms/:name/restart` | Restart a VM |
| POST | `/vms/:name/pause` | Pause a VM |
| POST | `/vms/:name/resume` | Resume a paused VM |
| GET | `/vms/:name/metrics` | Get VM resource metrics |
| GET | `/vms/:name/status` | Get detailed VM status |

### Example: Create a VM

```
POST /api/vms
Content-Type: application/json

{
  "name": "myvm",
  "image": "/path/to/image.qcow2",
  "cpus": 4,
  "memory": 4096
}
```

**Response (201 Created):**
```json
{
  "name": "myvm",
  "state": "stopped",
  "cpus": 4,
  "memory": 4096,
  "image": "/path/to/image.qcow2"
}
```

## Snapshots

Point-in-time VM state capture and restoration.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vms/:name/snapshots` | List snapshots for a VM |
| POST | `/vms/:name/snapshots` | Create a snapshot |
| GET | `/vms/:name/snapshots/:id` | Get snapshot details |
| DELETE | `/vms/:name/snapshots/:id` | Delete a snapshot |
| POST | `/vms/:name/snapshots/:id/revert` | Revert VM to snapshot |

## Storage

Disk and volume management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/storage/pools` | List storage pools |
| POST | `/storage/pools` | Create a storage pool |
| GET | `/storage/pools/:id` | Get pool details |
| DELETE | `/storage/pools/:id` | Delete a storage pool |
| GET | `/storage/volumes` | List volumes |
| POST | `/storage/volumes` | Create a volume |
| DELETE | `/storage/volumes/:id` | Delete a volume |
| POST | `/storage/volumes/:id/resize` | Resize a volume |
| POST | `/storage/volumes/:id/attach` | Attach volume to a VM |
| POST | `/storage/volumes/:id/detach` | Detach volume from a VM |

## Distributed Storage

Cluster-wide storage management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/distributed-storage/clusters` | List storage clusters |
| POST | `/distributed-storage/clusters` | Create a storage cluster |
| GET | `/distributed-storage/clusters/:id` | Get cluster details |
| DELETE | `/distributed-storage/clusters/:id` | Delete a storage cluster |

## Networking

Virtual network and interface management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/networks` | List virtual networks |
| POST | `/networks` | Create a virtual network |
| GET | `/networks/:id` | Get network details |
| PUT | `/networks/:id` | Update a network |
| DELETE | `/networks/:id` | Delete a network |
| GET | `/vms/:name/interfaces` | List VM network interfaces |
| POST | `/vms/:name/interfaces` | Attach a network interface |
| DELETE | `/vms/:name/interfaces/:id` | Detach a network interface |

## System

Daemon health, configuration, and system information.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/system/info` | System information |
| GET | `/system/config` | Get daemon configuration |
| PUT | `/system/config` | Update daemon configuration |
| GET | `/metrics` | Prometheus-format metrics |

## Quotas

Resource usage limits per user or project.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/quotas` | List all quotas |
| POST | `/quotas` | Create a quota |
| GET | `/quotas/:id` | Get quota details |
| PUT | `/quotas/:id` | Update a quota |
| DELETE | `/quotas/:id` | Delete a quota |
| GET | `/quotas/:id/usage` | Get current usage against quota |

## Schedules

Scheduled VM operations (start, stop, snapshot, backup).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/schedules` | List schedules |
| POST | `/schedules` | Create a schedule |
| GET | `/schedules/:id` | Get schedule details |
| PUT | `/schedules/:id` | Update a schedule |
| DELETE | `/schedules/:id` | Delete a schedule |
| POST | `/schedules/:id/trigger` | Manually trigger a schedule |

## Audit

Administrative action audit trail.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/audit/logs` | Query audit log entries |
| GET | `/audit/logs/:id` | Get a specific audit entry |
| GET | `/audit/summary` | Get audit summary statistics |

## Analytics

Usage and performance analytics.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/analytics/overview` | Platform-wide analytics summary |
| GET | `/analytics/vms` | Per-VM analytics |
| GET | `/analytics/resources` | Resource utilization trends |
| GET | `/analytics/reports` | Generate or list reports |

## Backups

VM backup and restore operations.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/backups` | List backups |
| POST | `/backups` | Create a backup |
| GET | `/backups/:id` | Get backup details |
| DELETE | `/backups/:id` | Delete a backup |
| POST | `/backups/:id/restore` | Restore a VM from backup |
| GET | `/backups/policies` | List backup policies |
| POST | `/backups/policies` | Create a backup policy |

## Notifications

Alert and notification management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/notifications` | List notifications |
| POST | `/notifications` | Create a notification rule |
| PUT | `/notifications/:id` | Update a notification rule |
| DELETE | `/notifications/:id` | Delete a notification rule |
| POST | `/notifications/:id/acknowledge` | Acknowledge a notification |
| GET | `/notifications/channels` | List notification channels |
| POST | `/notifications/channels` | Create a notification channel |

## Templates

VM templates for standardized provisioning.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/templates` | List templates |
| POST | `/templates` | Create a template |
| GET | `/templates/:id` | Get template details |
| PUT | `/templates/:id` | Update a template |
| DELETE | `/templates/:id` | Delete a template |
| POST | `/templates/:id/deploy` | Deploy a VM from template |

## Tags

Resource tagging and categorization.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/tags` | List all tags |
| POST | `/tags` | Create a tag |
| DELETE | `/tags/:id` | Delete a tag |
| POST | `/vms/:name/tags` | Tag a VM |
| DELETE | `/vms/:name/tags/:tag` | Remove a tag from a VM |

## Cloning

VM cloning (full and linked).

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/vms/:name/clone` | Clone a VM |
| GET | `/vms/:name/clones` | List clones of a VM |

## DRS (Distributed Resource Scheduler)

Automatic VM placement and load balancing.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/drs/config` | Get DRS configuration |
| PUT | `/drs/config` | Update DRS configuration |
| GET | `/drs/recommendations` | Get placement recommendations |
| POST | `/drs/recommendations/:id/apply` | Apply a recommendation |

## Fault Tolerance

VM fault tolerance configuration.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/vms/:name/ft` | Get fault tolerance status |
| POST | `/vms/:name/ft/enable` | Enable fault tolerance |
| POST | `/vms/:name/ft/disable` | Disable fault tolerance |

## Replication

VM replication to secondary hosts.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/replication/configs` | List replication configurations |
| POST | `/replication/configs` | Create a replication config |
| GET | `/replication/configs/:id` | Get replication config details |
| DELETE | `/replication/configs/:id` | Delete a replication config |
| POST | `/replication/configs/:id/sync` | Trigger manual sync |

## Site Recovery

Disaster recovery and failover.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/site-recovery/plans` | List recovery plans |
| POST | `/site-recovery/plans` | Create a recovery plan |
| POST | `/site-recovery/plans/:id/test` | Test a recovery plan |
| POST | `/site-recovery/plans/:id/execute` | Execute failover |
| POST | `/site-recovery/plans/:id/reprotect` | Reprotect after failover |

## Content Library

Shared image and template repository.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/content-library/items` | List library items |
| POST | `/content-library/items` | Upload an item |
| GET | `/content-library/items/:id` | Get item details |
| DELETE | `/content-library/items/:id` | Delete an item |
| POST | `/content-library/items/:id/deploy` | Deploy from library item |

## Lifecycle

VM lifecycle policies and operations.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/lifecycle/policies` | List lifecycle policies |
| POST | `/lifecycle/policies` | Create a lifecycle policy |
| PUT | `/lifecycle/policies/:id` | Update a lifecycle policy |
| DELETE | `/lifecycle/policies/:id` | Delete a lifecycle policy |

## Certificates

TLS certificate management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/certificates` | List certificates |
| POST | `/certificates` | Upload a certificate |
| DELETE | `/certificates/:id` | Delete a certificate |
| POST | `/certificates/:id/renew` | Renew a certificate |

## VPN Mesh

WireGuard-based VPN tunnels between VMs.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/vpn-tunnels` | Create a VPN tunnel |
| GET | `/vpn-tunnels` | List VPN tunnels |
| GET | `/vpn-tunnels/:id` | Get tunnel details |
| PUT | `/vpn-tunnels/:id` | Update a tunnel |
| DELETE | `/vpn-tunnels/:id` | Delete a tunnel |
| POST | `/vpn-tunnels/sync` | Force tunnel reconciliation |
| GET | `/vpn-tunnels/status` | Get tunnel status |
| POST | `/vpn-networks` | Create a VPN network |
| GET | `/vpn-networks` | List VPN networks |
| GET | `/vpn-networks/:id` | Get network details |
| PUT | `/vpn-networks/:id` | Update a network |
| DELETE | `/vpn-networks/:id` | Delete a network |
| GET | `/vpn-networks/status` | Get network status |

### Example: Create a VPN Network

```
POST /api/vpn-networks
Content-Type: application/json

{
  "name": "dev-mesh",
  "selector": { "match_labels": { "env": "dev" } },
  "subnet": "10.10.0.0/24",
  "topology": "full_mesh"
}
```

**Response (201 Created):**
```json
{
  "id": "...",
  "name": "dev-mesh",
  "topology": "full_mesh",
  "subnet": "10.10.0.0/24",
  "enabled": true
}
```

## Packet Mirror

Traffic mirroring for VM debugging.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mirror-sessions` | Create a mirror session |
| GET | `/mirror-sessions` | List mirror sessions |
| GET | `/mirror-sessions/:id` | Get session details |
| PUT | `/mirror-sessions/:id` | Update a session |
| DELETE | `/mirror-sessions/:id` | Delete a session |
| POST | `/mirror-sessions/sync` | Force mirror reconciliation |
| GET | `/mirror-sessions/status` | Get session status |

## NAT Gateway

Advanced NAT: masquerade, SNAT, DNAT, hairpin.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/nat-rules` | Create a NAT rule |
| GET | `/nat-rules` | List NAT rules |
| GET | `/nat-rules/:id` | Get rule details |
| PUT | `/nat-rules/:id` | Update a rule |
| DELETE | `/nat-rules/:id` | Delete a rule |
| POST | `/nat-rules/sync` | Force NAT reconciliation |
| GET | `/nat-rules/status` | Get rule status |
| POST | `/nat-pools` | Create a SNAT pool |
| GET | `/nat-pools` | List SNAT pools |
| GET | `/nat-pools/:id` | Get pool details |
| DELETE | `/nat-pools/:id` | Delete a pool |
| POST | `/nat-gateways` | Create a NAT gateway |
| GET | `/nat-gateways` | List NAT gateways |
| GET | `/nat-gateways/:id` | Get gateway details |
| DELETE | `/nat-gateways/:id` | Delete a gateway |

## Network Monitor

Per-VM bandwidth monitoring and alerting.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/monitor-policies` | Create a monitor policy |
| GET | `/monitor-policies` | List monitor policies |
| GET | `/monitor-policies/:id` | Get policy details |
| PUT | `/monitor-policies/:id` | Update a policy |
| DELETE | `/monitor-policies/:id` | Delete a policy |
| POST | `/monitor-policies/sync` | Force monitor reconciliation |
| GET | `/monitor-policies/status` | Get policy status |
| GET | `/network-metrics` | Get all VM network metrics |
| GET | `/network-metrics/:name` | Get per-VM network metrics |
| GET | `/bandwidth-alerts` | Get active bandwidth alerts |

## Encryption

Data-at-rest and key management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/encryption/keys` | List encryption keys |
| POST | `/encryption/keys` | Create an encryption key |
| DELETE | `/encryption/keys/:id` | Delete an encryption key |
| POST | `/encryption/keys/:id/rotate` | Rotate an encryption key |
| POST | `/vms/:name/encrypt` | Encrypt a VM's disks |

## Resource Pools

Resource grouping and allocation.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/resource-pools` | List resource pools |
| POST | `/resource-pools` | Create a resource pool |
| GET | `/resource-pools/:id` | Get pool details |
| PUT | `/resource-pools/:id` | Update a resource pool |
| DELETE | `/resource-pools/:id` | Delete a resource pool |
| POST | `/resource-pools/:id/assign` | Assign a VM to a pool |

## Datacenters

Logical datacenter management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/datacenters` | List datacenters |
| POST | `/datacenters` | Create a datacenter |
| GET | `/datacenters/:id` | Get datacenter details |
| PUT | `/datacenters/:id` | Update a datacenter |
| DELETE | `/datacenters/:id` | Delete a datacenter |

## Machines

Host machine management.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/machines` | List host machines |
| POST | `/machines` | Register a host machine |
| GET | `/machines/:id` | Get machine details |
| DELETE | `/machines/:id` | Remove a host machine |
| POST | `/machines/:id/maintenance` | Enter maintenance mode |

## Events

System and VM event stream.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/events` | Query events |
| GET | `/events/:id` | Get event details |
| GET | `/events/stream` | SSE event stream |

## Autoscale

Automatic VM scaling policies.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/autoscale/policies` | List autoscale policies |
| POST | `/autoscale/policies` | Create an autoscale policy |
| GET | `/autoscale/policies/:id` | Get policy details |
| PUT | `/autoscale/policies/:id` | Update a policy |
| DELETE | `/autoscale/policies/:id` | Delete a policy |

## Hotplug

Live add/remove of devices to running VMs.

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/vms/:name/hotplug/cpu` | Add/remove CPUs |
| POST | `/vms/:name/hotplug/memory` | Add/remove memory |
| POST | `/vms/:name/hotplug/disk` | Attach/detach disk |
| POST | `/vms/:name/hotplug/nic` | Attach/detach network interface |

## Image Builder

Custom VM image creation.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/image-builder/builds` | List builds |
| POST | `/image-builder/builds` | Start a new image build |
| GET | `/image-builder/builds/:id` | Get build status |
| DELETE | `/image-builder/builds/:id` | Cancel/delete a build |
| GET | `/image-builder/recipes` | List build recipes |
| POST | `/image-builder/recipes` | Create a build recipe |

---

## WebSocket Endpoints

WebSocket connections require the same authentication token, passed as a query parameter or via the initial HTTP upgrade headers.

| Endpoint | Description |
|----------|-------------|
| `ws://host:8080/ws/console/:vmname` | Interactive terminal console (xterm.js) |
| `ws://host:8080/ws/vnc/:vmname` | VNC graphical console proxy (noVNC) |
| `ws://host:8080/ws/events` | Real-time event stream for live UI updates |

### Console Example

```javascript
const ws = new WebSocket("ws://localhost:8080/ws/console/myvm?token=<token>");
ws.onmessage = (event) => term.write(event.data);
term.onData((data) => ws.send(data));
```

---

## VM States

| State | Description |
|-------|-------------|
| `running` | VM is running |
| `stopped` | VM is stopped |
| `paused` | VM is paused |
| `starting` | VM is being started (async, returns 202 Accepted) |
| `stopping` | VM is being stopped |
| `failed` | VM encountered an error |
| `unknown` | VM state cannot be determined |

## Error Responses

All errors return a JSON body:

```json
{
  "error": "Error message here",
  "code": "ERROR_CODE"
}
```

**Common Status Codes:**

| Code | Meaning |
|------|---------|
| 200 | OK |
| 201 | Created |
| 204 | No Content |
| 400 | Bad Request |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not Found |
| 409 | Conflict |
| 422 | Unprocessable Entity |
| 429 | Too Many Requests |
| 500 | Internal Server Error |
