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
