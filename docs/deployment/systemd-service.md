# Systemd Service Configuration

This document provides a production-ready systemd unit file for Zyvor Fabric,
with socket activation, resource limits, security sandboxing, and journald
integration.

---

## Table of Contents

1. [Unit File](#unit-file)
2. [Installation](#installation)
3. [Socket Activation](#socket-activation)
4. [Resource Limits](#resource-limits)
5. [Security Sandboxing](#security-sandboxing)
6. [Journald Integration](#journald-integration)
7. [Overrides and Customization](#overrides-and-customization)

---

## Unit File

Create `/etc/systemd/system/Zyvor Fabric.service`:

```ini
[Unit]
Description=Zyvor Fabric - Virtual Machine Management Daemon
Documentation=https://github.com/example/Zyvor Fabric
After=network-online.target systemd-machined.service
Wants=network-online.target
Requires=systemd-machined.service

# Restart on failure with backoff
StartLimitIntervalSec=300
StartLimitBurst=5

[Service]
Type=simple
ExecStart=/usr/local/bin/Zyvor Fabric
Restart=on-failure
RestartSec=5s
TimeoutStartSec=30s
TimeoutStopSec=30s
WatchdogSec=120s

# -------------------------------------------------------------------
# User and Group
# -------------------------------------------------------------------
# Run as root for full KVM/network access, or as a dedicated user
# with appropriate capabilities.
# User=Zyvor Fabric
# Group=Zyvor Fabric

# -------------------------------------------------------------------
# Environment
# -------------------------------------------------------------------
Environment=VSPAWN_LOG_LEVEL=info

# Load secrets from a dedicated environment file (mode 0600)
# EnvironmentFile=-/etc/vmspawnd/vmspawnd.env
# Example /etc/vmspawnd/vmspawnd.env:
#   VMSPAWND_JWT_SECRET=your-64-char-secret
#   VMSPAWND_ADMIN_PASSWORD=your-admin-password

# -------------------------------------------------------------------
# Resource Limits
# -------------------------------------------------------------------
# File descriptor limit (needed for many concurrent VMs + connections)
LimitNOFILE=65536

# Process limit
LimitNPROC=4096

# Core dump size (disable in production)
LimitCORE=0

# Memory limit for the daemon process itself (not VMs)
MemoryMax=2G
MemoryHigh=1G

# CPU weight (relative to other services)
CPUWeight=200

# -------------------------------------------------------------------
# Security Sandboxing
# -------------------------------------------------------------------
# Restrict filesystem access
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=/var/lib/vmspawnd /etc/systemd/network /run/systemd
ReadOnlyPaths=/etc/vmspawnd

# Restrict privilege escalation
NoNewPrivileges=yes

# Restrict kernel capabilities
# Note: Running VMs may require additional capabilities.
# CAP_NET_ADMIN: network bridge/tap management
# CAP_SYS_ADMIN: cgroup and mount namespace operations
# CAP_DAC_OVERRIDE: access VM images owned by other users
AmbientCapabilities=CAP_NET_ADMIN CAP_SYS_ADMIN CAP_DAC_OVERRIDE
CapabilityBoundingSet=CAP_NET_ADMIN CAP_SYS_ADMIN CAP_DAC_OVERRIDE CAP_NET_RAW CAP_SETUID CAP_SETGID CAP_KILL

# Restrict system call filter
SystemCallFilter=@system-service @mount @network-io @ipc
SystemCallFilter=~@clock @cpu-emulation @debug @module @obsolete @raw-io @reboot @swap
SystemCallArchitectures=native

# Restrict address families
RestrictAddressFamilies=AF_INET AF_INET6 AF_UNIX AF_NETLINK

# Restrict namespace creation (allow network and mount for VMs)
RestrictNamespaces=yes

# Private temporary directory
PrivateTmp=yes

# Protect kernel tunables
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes

# Restrict real-time scheduling
RestrictRealtime=yes

# Lock memory (prevent swapping of sensitive data)
LockPersonality=yes

# -------------------------------------------------------------------
# Logging
# -------------------------------------------------------------------
StandardOutput=journal
StandardError=journal
SyslogIdentifier=Zyvor Fabric

# Structured logging fields
LogExtraFields=COMPONENT=Zyvor Fabric

[Install]
WantedBy=multi-user.target
```

---

## Installation

```bash
# Install the unit file
sudo install -m 644 Zyvor Fabric.service /etc/systemd/system/

# Reload systemd to pick up the new unit
sudo systemctl daemon-reload

# Enable the service to start on boot
sudo systemctl enable Zyvor Fabric

# Start the service
sudo systemctl start Zyvor Fabric

# Verify it is running
sudo systemctl status Zyvor Fabric
```

---

## Socket Activation

For environments where Zyvor Fabric should only start when a connection arrives,
use socket activation. Create `/etc/systemd/system/Zyvor Fabric.socket`:

```ini
[Unit]
Description=Zyvor Fabric Socket

[Socket]
ListenStream=127.0.0.1:9095
NoDelay=yes
ReusePort=yes
Backlog=128

# Accept connections even while the service is starting
Accept=no

# Trigger Zyvor Fabric.service when a connection arrives
Service=Zyvor Fabric.service

[Install]
WantedBy=sockets.target
```

When using socket activation:

```bash
# Enable and start the socket (not the service directly)
sudo systemctl enable Zyvor Fabric.socket
sudo systemctl start Zyvor Fabric.socket

# The service will start automatically on first connection
curl http://127.0.0.1:9095/api/v1/vms
```

Note: Socket activation requires Zyvor Fabric to accept the inherited file descriptor.
This is currently supported only if the daemon is started with systemd integration.

---

## Resource Limits

### File Descriptors

Each running VM consumes file descriptors for its QEMU process, TAP devices,
and disk images. The default `LimitNOFILE=65536` supports approximately
1000 concurrent VMs. Adjust upward for larger deployments:

```ini
# For very large deployments (1000+ VMs)
LimitNOFILE=131072
```

### Memory

The `MemoryMax` and `MemoryHigh` limits apply only to the vmspawnd daemon
process, not to the VMs it manages. VMs run as separate QEMU processes under
`systemd-vmspawn` and are not children of the Zyvor Fabric cgroup.

```ini
# Daemon process memory limit
MemoryMax=2G      # Hard limit, OOM kill if exceeded
MemoryHigh=1G     # Soft limit, throttle if exceeded
```

### CPU

```ini
# CPU weight (default is 100, higher = more CPU time)
CPUWeight=200

# Optional: pin to specific cores
# AllowedCPUs=0-3
```

---

## Security Sandboxing

The unit file includes comprehensive systemd sandboxing directives. Here is
a breakdown of each category:

### Filesystem Protection

| Directive            | Value      | Effect                                     |
|----------------------|------------|--------------------------------------------|
| `ProtectHome`        | `yes`      | Hides /home, /root, /run/user              |
| `ProtectSystem`      | `strict`   | Mounts / read-only, except allowed paths   |
| `ReadWritePaths`     | (see file) | Writable paths for state, network config   |
| `ReadOnlyPaths`      | (see file) | Config directory is read-only              |
| `PrivateTmp`         | `yes`      | Isolated /tmp and /var/tmp                 |

### Privilege Restriction

| Directive              | Value  | Effect                                      |
|------------------------|--------|---------------------------------------------|
| `NoNewPrivileges`      | `yes`  | Cannot gain new privileges via execve       |
| `LockPersonality`      | `yes`  | Prevents changing execution domain          |
| `RestrictRealtime`     | `yes`  | Cannot acquire realtime scheduling          |

### Capability Bounding

The daemon needs specific Linux capabilities for VM management:

| Capability       | Reason                                             |
|------------------|----------------------------------------------------|
| `CAP_NET_ADMIN`  | Create/manage bridges, TAP devices, nftables rules |
| `CAP_SYS_ADMIN`  | Mount operations, cgroup management                |
| `CAP_DAC_OVERRIDE`| Access VM images across user boundaries           |
| `CAP_NET_RAW`    | Raw socket access for network monitoring           |
| `CAP_KILL`       | Send signals to QEMU processes                     |

### System Call Filtering

The `SystemCallFilter` restricts which system calls the daemon can make:

- Allowed: `@system-service`, `@mount`, `@network-io`, `@ipc`
- Denied: `@clock`, `@cpu-emulation`, `@debug`, `@module`, `@obsolete`,
  `@raw-io`, `@reboot`, `@swap`

---

## Journald Integration

Zyvor Fabric logs to stdout/stderr, which systemd captures into the journal.

### Viewing Logs

```bash
# Follow logs in real time
journalctl -u Zyvor Fabric -f

# Show logs from the current boot
journalctl -u Zyvor Fabric -b

# Show only error-level messages
journalctl -u Zyvor Fabric -p err

# Show logs from the last hour
journalctl -u Zyvor Fabric --since "1 hour ago"

# Show logs in JSON format for parsing
journalctl -u Zyvor Fabric -o json-pretty

# Show logs with specific fields
journalctl COMPONENT=Zyvor Fabric
```

### Log Rotation

Journald handles log rotation automatically. Configure retention in
`/etc/systemd/journald.conf`:

```ini
[Journal]
# Maximum disk usage for journal files
SystemMaxUse=1G

# Maximum age for journal entries
MaxRetentionSec=30day

# Compress stored journal data
Compress=yes
```

### Forwarding to External Systems

To forward Zyvor Fabric logs to an external logging system:

```bash
# Forward to syslog
journalctl -u Zyvor Fabric -f --output=syslog | logger -t Zyvor Fabric &

# Forward to a file (for log shipping)
journalctl -u Zyvor Fabric -f --output=short-iso >> /var/log/Zyvor Fabric/Zyvor Fabric.log &
```

---

## Overrides and Customization

Use systemd drop-in files to customize the service without modifying the
main unit file:

```bash
# Create an override directory
sudo mkdir -p /etc/systemd/system/Zyvor Fabric.service.d/

# Add custom environment variables
sudo tee /etc/systemd/system/Zyvor Fabric.service.d/environment.conf << 'EOF'
[Service]
Environment=VSPAWN_LOG_LEVEL=debug
Environment=VMSPAWND_JWT_SECRET=my-production-secret
EOF

# Increase resource limits
sudo tee /etc/systemd/system/Zyvor Fabric.service.d/limits.conf << 'EOF'
[Service]
LimitNOFILE=131072
MemoryMax=4G
EOF

# Reload and restart
sudo systemctl daemon-reload
sudo systemctl restart Zyvor Fabric
```

To view the effective configuration after overrides:

```bash
sudo systemctl cat Zyvor Fabric
```
