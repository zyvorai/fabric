# Networking Guide

## Network Interfaces

### Create Network Interface

```bash
curl -X POST http://localhost:8080/api/vms/myvm/network \
  -H "Content-Type: application/json" \
  -d '{
    "name": "eth0",
    "bridge": "br0",
    "mac_address": "52:54:00:12:34:56"
  }'
```

### Multiple NICs

VMs can have multiple network interfaces:

```bash
# Primary interface (NAT)
{
  "name": "eth0",
  "bridge": "virbr0"
}

# Secondary interface (bridged)
{
  "name": "eth1",
  "bridge": "br0"
}
```

## Bridges

### Create Bridge

```bash
curl -X POST http://localhost:8080/api/network/bridges \
  -H "Content-Type: application/json" \
  -d '{"name": "br0"}'
```

Manual creation:

```bash
sudo ip link add name br0 type bridge
sudo ip link set br0 up
sudo ip addr add 192.168.100.1/24 dev br0
```

### Delete Bridge

```bash
curl -X DELETE http://localhost:8080/api/network/bridges/br0
```

## VLANs

### Create VLAN

```bash
curl -X POST http://localhost:8080/api/network/vlans \
  -H "Content-Type: application/json" \
  -d '{
    "bridge": "br0",
    "vlan_id": 100
  }'
```

### Assign VM to VLAN

```bash
curl -X POST http://localhost:8080/api/vms/myvm/network \
  -H "Content-Type: application/json" \
  -d '{
    "name": "eth0",
    "bridge": "br0",
    "vlan_id": 100
  }'
```

## Port Forwarding

### Add Port Forward

```bash
curl -X POST http://localhost:8080/api/vms/myvm/port-forwards \
  -H "Content-Type: application/json" \
  -d '{
    "protocol": "tcp",
    "host_port": 8080,
    "guest_port": 80,
    "guest_ip": "192.168.100.10"
  }'
```

Access from host:

```bash
curl http://localhost:8080  # Forwards to VM port 80
```

### Remove Port Forward

```bash
curl -X DELETE http://localhost:8080/api/vms/myvm/port-forwards/8080
```

## Network Modes

### NAT (Default)

VMs can access internet but not directly accessible from outside.

```toml
[network]
mode = "nat"
bridge = "virbr0"
```

### Bridged

VMs get IP from external DHCP, directly accessible.

```toml
[network]
mode = "bridge"
bridge = "br0"
```

### Isolated

VMs can only communicate with each other.

```toml
[network]
mode = "isolated"
bridge = "br-isolated"
```

## Firewall Rules

### Allow Traffic

```bash
curl -X POST http://localhost:8080/api/network/firewall/rules \
  -H "Content-Type: application/json" \
  -d '{
    "action": "allow",
    "protocol": "tcp",
    "port": 22,
    "source": "192.168.1.0/24"
  }'
```

### Block Traffic

```bash
curl -X POST http://localhost:8080/api/network/firewall/rules \
  -H "Content-Type: application/json" \
  -d '{
    "action": "deny",
    "protocol": "tcp",
    "port": 23
  }'
```

## DNS Configuration

### Custom DNS Servers

```toml
[network]
dns_servers = ["8.8.8.8", "8.8.4.4"]
```

### Local DNS

```toml
[network]
enable_dns = true
domain = "vmspawnd.local"
```

VMs automatically get DNS names:
- `myvm.vmspawnd.local` → `192.168.100.10`

## Network Performance

### Enable Virtio

For best performance, use virtio network driver:

```bash
# Automatically enabled for modern Linux guests
model = "virtio"
```

### Jumbo Frames

Enable for high-throughput workloads:

```bash
sudo ip link set br0 mtu 9000
```

## VPN Mesh

WireGuard-based VPN tunnels between VMs. Supports point-to-point, hub-spoke, and full-mesh topologies.

Implemented in `backend/vpn-mesh/`. Uses `ip link` and `wg` commands for WireGuard interface management.

### Create a VPN Tunnel

```bash
curl -X POST http://localhost:8080/api/vpn-tunnels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "site-link",
    "interface_name": "wg0",
    "listen_port": 51820,
    "address": "10.10.0.1/24",
    "private_key_ref": "vault:wg/site-link",
    "peers": [
      {
        "public_key": "abc123...",
        "endpoint": "203.0.113.5:51820",
        "allowed_ips": ["10.10.0.2/32"],
        "persistent_keepalive": 25
      }
    ]
  }'
```

### Create a VPN Network (Auto-Mesh)

VPN networks use label selectors to automatically generate WireGuard interfaces for matching VMs.

```bash
curl -X POST http://localhost:8080/api/vpn-networks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-mesh",
    "selector": { "match_labels": { "env": "dev" } },
    "subnet": "10.10.0.0/24",
    "topology": "full_mesh",
    "listen_port": 51820
  }'
```

Topologies: `full_mesh` (every VM peers with every other), `hub_spoke` (first VM is hub), `point_to_point` (first two VMs only).

### VPN API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/vpn-tunnels` | Create a tunnel |
| GET | `/vpn-tunnels` | List tunnels |
| GET | `/vpn-tunnels/:id` | Get tunnel |
| PUT | `/vpn-tunnels/:id` | Update tunnel |
| DELETE | `/vpn-tunnels/:id` | Delete tunnel |
| POST | `/vpn-tunnels/sync` | Force reconciliation |
| GET | `/vpn-tunnels/status` | Tunnel status |
| POST | `/vpn-networks` | Create a network |
| GET | `/vpn-networks` | List networks |
| GET | `/vpn-networks/:id` | Get network |
| PUT | `/vpn-networks/:id` | Update network |
| DELETE | `/vpn-networks/:id` | Delete network |
| GET | `/vpn-networks/status` | Network status |

### Testing

```bash
cargo test -p vpn-mesh
```

## Packet Mirror

Traffic mirroring for VM debugging and monitoring. Uses Linux `tc` mirred actions to copy packets from VM tap interfaces to a collector.

Implemented in `backend/packet-mirror/`.

### Create a Mirror Session

```bash
curl -X POST http://localhost:8080/api/mirror-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "debug-capture",
    "selector": { "match_labels": { "env": "staging" } },
    "collector_type": "interface",
    "collector_target": "mon0",
    "direction": "both",
    "filter": {
      "protocol": "tcp",
      "dst_port": 80
    }
  }'
```

Directions: `ingress`, `egress`, `both`. The collector target is either a local interface name or a remote IP (for GRE/ERSPAN tunnels).

### Mirror API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/mirror-sessions` | Create session |
| GET | `/mirror-sessions` | List sessions |
| GET | `/mirror-sessions/:id` | Get session |
| PUT | `/mirror-sessions/:id` | Update session |
| DELETE | `/mirror-sessions/:id` | Delete session |
| POST | `/mirror-sessions/sync` | Force reconciliation |
| GET | `/mirror-sessions/status` | Session status |

### Testing

```bash
cargo test -p packet-mirror
```

## NAT Gateway

Advanced NAT with masquerade, SNAT pools, DNAT, and hairpin NAT. Uses nftables with a dedicated `vmspawnd_nat` table.

Implemented in `backend/nat-gateway/`.

### Create a Masquerade Rule

```bash
curl -X POST http://localhost:8080/api/nat-rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vm-internet",
    "rule_type": "masquerade",
    "selector": { "match_labels": { "zone": "internal" } },
    "outbound_interface": "eth0"
  }'
```

### Create a DNAT Rule

```bash
curl -X POST http://localhost:8080/api/nat-rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-forward",
    "rule_type": "dnat",
    "protocol": "tcp",
    "dest_cidr": "203.0.113.1",
    "dest_port": 80,
    "translate_to": "10.0.0.5",
    "translate_port": 8080
  }'
```

### Create a SNAT Pool

```bash
# Create a pool of public IPs
curl -X POST http://localhost:8080/api/nat-pools \
  -H "Content-Type: application/json" \
  -d '{
    "name": "public-pool",
    "ip_ranges": ["203.0.113.10-203.0.113.20"],
    "port_range": "1024-65535"
  }'

# Create an SNAT rule using the pool
curl -X POST http://localhost:8080/api/nat-rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "snat-outbound",
    "rule_type": "snat",
    "selector": { "match_labels": { "tier": "app" } },
    "pool_id": "<pool-uuid>"
  }'
```

### Create a NAT Gateway

Shorthand for subnet-level masquerade:

```bash
curl -X POST http://localhost:8080/api/nat-gateways \
  -H "Content-Type: application/json" \
  -d '{
    "name": "default-gw",
    "subnet": "10.0.0.0/24",
    "outbound_interface": "eth0"
  }'
```

### NAT API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/nat-rules` | Create rule |
| GET | `/nat-rules` | List rules |
| GET | `/nat-rules/:id` | Get rule |
| PUT | `/nat-rules/:id` | Update rule |
| DELETE | `/nat-rules/:id` | Delete rule |
| POST | `/nat-rules/sync` | Force reconciliation |
| GET | `/nat-rules/status` | Rule status |
| POST | `/nat-pools` | Create pool |
| GET | `/nat-pools` | List pools |
| GET | `/nat-pools/:id` | Get pool |
| DELETE | `/nat-pools/:id` | Delete pool |
| POST | `/nat-gateways` | Create gateway |
| GET | `/nat-gateways` | List gateways |
| GET | `/nat-gateways/:id` | Get gateway |
| DELETE | `/nat-gateways/:id` | Delete gateway |

### nftables Structure

```
table ip vmspawnd_nat {
    chain nat_prerouting { type nat hook prerouting priority -100; }
    chain nat_postrouting { type nat hook postrouting priority 100; }
}
```

### Testing

```bash
cargo test -p nat-gateway
```

## Network Monitor

Per-VM bandwidth monitoring with threshold-based alerts. Reads counters from `/sys/class/net/*/statistics/*` and computes rates.

Implemented in `backend/net-monitor/`.

### Create a Monitor Policy

```bash
curl -X POST http://localhost:8080/api/monitor-policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "high-bandwidth-alert",
    "selector": { "match_labels": { "tier": "production" } },
    "thresholds": [
      {
        "value": 100,
        "unit": "mbps",
        "direction": "rx",
        "severity": "warning"
      },
      {
        "value": 500,
        "unit": "mbps",
        "direction": "both",
        "severity": "critical"
      }
    ],
    "action": "log",
    "sample_interval_secs": 10
  }'
```

Threshold units: `bps`, `kbps`, `mbps`, `gbps`. Directions: `rx`, `tx`, `both`. Severities: `info`, `warning`, `critical`. Actions: `log`, `event`, `webhook`.

### View Metrics and Alerts

```bash
# All VM network metrics
curl http://localhost:8080/api/network-metrics

# Per-VM metrics
curl http://localhost:8080/api/network-metrics/myvm

# Active bandwidth alerts
curl http://localhost:8080/api/bandwidth-alerts
```

### Monitor API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/monitor-policies` | Create policy |
| GET | `/monitor-policies` | List policies |
| GET | `/monitor-policies/:id` | Get policy |
| PUT | `/monitor-policies/:id` | Update policy |
| DELETE | `/monitor-policies/:id` | Delete policy |
| POST | `/monitor-policies/sync` | Force reconciliation |
| GET | `/monitor-policies/status` | Policy status |
| GET | `/network-metrics` | All VM metrics |
| GET | `/network-metrics/:name` | Per-VM metrics |
| GET | `/bandwidth-alerts` | Active alerts |

### Testing

```bash
cargo test -p net-monitor
```

## Background Reconciliation

All networking crates run background reconciliation loops:

| Crate | Interval | Description |
|-------|----------|-------------|
| vpn-mesh | 30s | Sync WireGuard interfaces |
| packet-mirror | 30s | Sync tc mirror rules |
| nat-gateway | 30s | Sync nftables NAT rules |
| net-monitor | 10s | Collect metrics and evaluate thresholds |

Use the `/sync` endpoint on any crate to force immediate reconciliation.

## Testing All Networking Crates

```bash
# Test individual crates
cargo test -p network-policy
cargo test -p service-mesh
cargo test -p traffic-shaping
cargo test -p dns-policy
cargo test -p vm-firewall
cargo test -p vpn-mesh
cargo test -p packet-mirror
cargo test -p nat-gateway
cargo test -p net-monitor

# Test all at once
cargo test -p vpn-mesh -p packet-mirror -p nat-gateway -p net-monitor
```

## Troubleshooting

### Check VM Network

```bash
# Inside VM
ip addr show
ip route show
ping -c 3 8.8.8.8
```

### Check Bridge

```bash
# On host
ip link show br0
bridge link show
```

### Check Port Forwards

```bash
sudo iptables -t nat -L PREROUTING -n -v
```

### Check WireGuard Tunnels

```bash
sudo wg show
sudo ip link show type wireguard
```

### Check NAT Rules

```bash
sudo nft list table ip vmspawnd_nat
```

### Check Mirror Rules

```bash
sudo tc -s qdisc show
sudo tc filter show dev tap-myvm parent ffff:
```

### Check Network Counters

```bash
cat /sys/class/net/tap-myvm/statistics/rx_bytes
cat /sys/class/net/tap-myvm/statistics/tx_bytes
```
