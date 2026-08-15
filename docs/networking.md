# Networking

Zyvor Fabric provides comprehensive virtual networking with bridge management, VLANs, port forwarding, and an enterprise-grade network security stack including firewalls, VPN mesh, NAT gateways, traffic shaping, and packet mirroring.

---

## Network Modes

| Mode | Description | Configuration |
|------|-------------|---------------|
| **NAT** (default) | VMs access the internet via host NAT; not directly reachable from outside | `mode = "nat"` |
| **Bridged** | VMs get IPs from external DHCP; directly accessible on the LAN | `mode = "bridge"` |
| **Isolated** | VMs can only communicate with each other | `mode = "isolated"` |

```toml
# /etc/zyvor-fabricd/zyvor-fabricd.toml
[network]
mode = "bridge"
bridge = "br0"
```

---

## Bridges

```bash
# Create a bridge
curl -X POST http://localhost:9095/api/network/bridges \
  -H "Content-Type: application/json" \
  -d '{"name": "br0"}'

# Delete a bridge
curl -X DELETE http://localhost:9095/api/network/bridges/br0

# Manual creation
sudo ip link add name br0 type bridge
sudo ip link set br0 up
sudo ip addr add 192.168.100.1/24 dev br0
```

---

## Network Interfaces

### Add a NIC to a VM

```bash
curl -X POST http://localhost:9095/api/vms/myvm/network \
  -H "Content-Type: application/json" \
  -d '{"name": "eth0", "bridge": "br0", "mac_address": "52:54:00:12:34:56"}'
```

### Multiple NICs

```bash
# Primary (NAT)
{"name": "eth0", "bridge": "virbr0"}

# Secondary (bridged)
{"name": "eth1", "bridge": "br0"}
```

---

## VLANs

```bash
# Create a VLAN on a bridge
curl -X POST http://localhost:9095/api/network/vlans \
  -H "Content-Type: application/json" \
  -d '{"bridge": "br0", "vlan_id": 100}'

# Assign a VM to a VLAN
curl -X POST http://localhost:9095/api/vms/myvm/network \
  -H "Content-Type: application/json" \
  -d '{"name": "eth0", "bridge": "br0", "vlan_id": 100}'
```

---

## Port Forwarding

```bash
# Forward host port 8080 to VM port 80
curl -X POST http://localhost:9095/api/vms/myvm/port-forwards \
  -H "Content-Type: application/json" \
  -d '{"protocol": "tcp", "host_port": 8080, "guest_port": 80, "guest_ip": "192.168.100.10"}'

# Remove
curl -X DELETE http://localhost:9095/api/vms/myvm/port-forwards/8080
```

---

## DNS

```toml
[network]
enable_dns = true
domain = "Zyvor Fabric.local"
dns_servers = ["8.8.8.8", "8.8.4.4"]
```

VMs automatically get DNS names: `myvm.Zyvor Fabric.local`

---

## Network Security Stack

Zyvor Fabric includes a Cilium-style network security stack. All security resources use label selectors to match VMs and run background reconciliation loops to keep the system in the desired state.

### Network Policies

Label-based ingress/egress rules:

```bash
curl -X POST http://localhost:9095/api/network-policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "allow-web",
    "selector": {"match_labels": {"role": "web"}},
    "ingress": [{"port": 80, "protocol": "tcp"}],
    "egress": [{"port": 443, "protocol": "tcp"}],
    "priority": 100,
    "action": "allow"
  }'
```

### VM Firewall

Per-VM firewall profiles and zones via nftables:

```bash
# Create a firewall profile
curl -X POST http://localhost:9095/api/firewall-profiles \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-profile",
    "rules": [
      {"protocol": "tcp", "port": 80, "action": "allow"},
      {"protocol": "tcp", "port": 443, "action": "allow"}
    ]
  }'

# Assign to a VM
zyvorctl firewall assign myvm --profile=web-profile
```

### Service Mesh

Virtual IP load-balanced services:

```bash
curl -X POST http://localhost:9095/api/services \
  -H "Content-Type: application/json" \
  -d '{
    "name": "web-service",
    "virtual_ip": "10.0.0.100",
    "port": 80,
    "algorithm": "round_robin",
    "selector": {"match_labels": {"role": "web"}}
  }'
```

Algorithms: `round_robin`, `least_conn`, `random`, `ip_hash`.

### QoS / Traffic Shaping

Bandwidth management with guaranteed and maximum rates:

```bash
curl -X POST http://localhost:9095/api/qos-policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "standard-qos",
    "selector": {"match_labels": {"tier": "standard"}},
    "guaranteed_rate_mbps": 10,
    "max_rate_mbps": 100,
    "burst_kb": 1024,
    "priority": 5
  }'
```

### DNS Policy

Zone management and domain blocking:

```bash
curl -X POST http://localhost:9095/api/dns-policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "block-ads",
    "selector": {"match_labels": {"env": "production"}},
    "blocked_domains": ["ads.example.com"],
    "upstream_servers": ["1.1.1.1", "8.8.8.8"]
  }'
```

### VPN Mesh

WireGuard tunnels with three topologies:

```bash
# Create a tunnel
curl -X POST http://localhost:9095/api/vpn-tunnels \
  -H "Content-Type: application/json" \
  -d '{
    "name": "site-link",
    "interface_name": "wg0",
    "listen_port": 51820,
    "address": "10.10.0.1/24",
    "private_key_ref": "vault:wg/site-link",
    "peers": [{
      "public_key": "abc123...",
      "endpoint": "203.0.113.5:51820",
      "allowed_ips": ["10.10.0.2/32"],
      "persistent_keepalive": 25
    }]
  }'

# Create an auto-mesh network
curl -X POST http://localhost:9095/api/vpn-networks \
  -H "Content-Type: application/json" \
  -d '{
    "name": "dev-mesh",
    "selector": {"match_labels": {"env": "dev"}},
    "subnet": "10.10.0.0/24",
    "topology": "full_mesh",
    "listen_port": 51820
  }'
```

Topologies: `full_mesh`, `hub_spoke`, `point_to_point`.

### Packet Mirror

Traffic capture for debugging and monitoring:

```bash
curl -X POST http://localhost:9095/api/mirror-sessions \
  -H "Content-Type: application/json" \
  -d '{
    "name": "debug-capture",
    "selector": {"match_labels": {"env": "staging"}},
    "collector_type": "interface",
    "collector_target": "mon0",
    "direction": "both",
    "filter": {"protocol": "tcp", "dst_port": 80}
  }'
```

Directions: `ingress`, `egress`, `both`.

### NAT Gateway

Masquerade, SNAT, DNAT, and hairpin NAT via nftables:

```bash
# Masquerade
curl -X POST http://localhost:9095/api/nat-rules \
  -H "Content-Type: application/json" \
  -d '{
    "name": "vm-internet",
    "rule_type": "masquerade",
    "selector": {"match_labels": {"zone": "internal"}},
    "outbound_interface": "eth0"
  }'

# DNAT (port forward)
curl -X POST http://localhost:9095/api/nat-rules \
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

### Network Monitor

Per-VM bandwidth tracking with threshold alerts:

```bash
curl -X POST http://localhost:9095/api/monitor-policies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "high-bandwidth-alert",
    "selector": {"match_labels": {"tier": "production"}},
    "thresholds": [
      {"value": 100, "unit": "mbps", "direction": "rx", "severity": "warning"},
      {"value": 500, "unit": "mbps", "direction": "both", "severity": "critical"}
    ],
    "action": "log",
    "sample_interval_secs": 10
  }'

# View metrics and alerts
curl http://localhost:9095/api/network-metrics
curl http://localhost:9095/api/network-metrics/myvm
curl http://localhost:9095/api/bandwidth-alerts
```

---

## Background Reconciliation

All networking crates run reconciliation loops to keep the system in the desired state:

| Component | Interval | Description |
|-----------|:--------:|-------------|
| VPN Mesh | 30s | Sync WireGuard interfaces |
| Packet Mirror | 30s | Sync tc mirror rules |
| NAT Gateway | 30s | Sync nftables NAT rules |
| Network Monitor | 10s | Collect metrics and evaluate thresholds |

Force immediate reconciliation on any component with its `/sync` endpoint.

---

## Performance

### Virtio

Virtio network drivers are automatically used for modern Linux guests, providing near-native network performance.

### Jumbo Frames

Enable for high-throughput workloads:

```bash
sudo ip link set br0 mtu 9000
```

---

## Testing

```bash
# Individual crates
cargo test -p network-policy
cargo test -p service-mesh
cargo test -p traffic-shaping
cargo test -p dns-policy
cargo test -p vm-firewall
cargo test -p vpn-mesh
cargo test -p packet-mirror
cargo test -p nat-gateway
cargo test -p net-monitor

# All networking crates
cargo test -p vpn-mesh -p packet-mirror -p nat-gateway -p net-monitor
```

---

## Troubleshooting

```bash
# VM network
ip addr show              # Inside VM
ip route show             # Inside VM

# Host bridge
ip link show br0
bridge link show

# Port forwards
sudo iptables -t nat -L PREROUTING -n -v

# WireGuard tunnels
sudo wg show

# NAT rules
sudo nft list table ip vmspawnd_nat

# Mirror rules
sudo tc -s qdisc show
sudo tc filter show dev tap-myvm parent ffff:

# Network counters
cat /sys/class/net/tap-myvm/statistics/rx_bytes
cat /sys/class/net/tap-myvm/statistics/tx_bytes
```
