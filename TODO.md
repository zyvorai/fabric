# vmspawnd Roadmap & TODO

## Core Features (In Progress)

- [x] REST API daemon
- [x] CLI tool (vmctl)
- [x] TUI (vmctl-tui)
- [x] Web UI
- [x] systemd integration
- [x] Basic VM lifecycle management
- [x] State persistence

## Phase 1: Advanced Features

### WebSocket Console
- [ ] WebSocket endpoint for console access
- [ ] xterm.js integration in web UI
- [ ] PTY streaming from systemd-vmspawn
- [ ] Console authentication
- [ ] Multiple concurrent sessions

Implementation plan:
```rust
// backend/vmspawnd/src/websocket.rs
pub async fn console_handler(
    ws: WebSocketUpgrade,
    vm_name: String,
) -> impl IntoResponse {
    // PTY connection to machinectl shell
}
```

### VNC/noVNC Integration
- [ ] VNC server configuration per VM
- [ ] noVNC web client integration
- [ ] WebSocket VNC proxy
- [ ] VNC authentication
- [ ] Clipboard support

Files to create:
- `backend/vnc-proxy/` - VNC WebSocket proxy
- `web/src/components/VNCViewer.tsx` - noVNC integration

### Cloud-init Support
- [ ] cloud-init image generation
- [ ] User-data/meta-data support
- [ ] Network configuration
- [ ] SSH key injection
- [ ] Instance initialization

Files to create:
- `backend/cloud-init/` - cloud-init handling
- API endpoint: `POST /api/vms/:name/cloud-init`

### TPM/vTPM Support
- [ ] vTPM device creation
- [ ] TPM state persistence
- [ ] Secure boot integration
- [ ] Attestation support

Dependencies:
- swtpm
- libtpms

## Phase 2: Ecosystem Integration

### Kubernetes Operator
- [ ] CRD definition for VMs
- [ ] Controller implementation
- [ ] Status reporting
- [ ] Event handling

Structure:
```
operator/
├── Cargo.toml
├── charts/
│   └── vmspawnd-operator/
└── src/
    ├── crd.rs
    ├── controller.rs
    └── reconcile.rs
```

### Terraform Provider
- [ ] Provider implementation
- [ ] Resource: vmspawnd_vm
- [ ] Data source: vmspawnd_vms
- [ ] Documentation

Repository: `terraform-provider-vmspawnd`

## Phase 3: Production Features

### High Availability
- [ ] Distributed state store (etcd)
- [ ] VM migration support
- [ ] Health checks
- [ ] Automatic failover

### Monitoring & Metrics
- [ ] Prometheus exporter
- [ ] Grafana dashboards
- [ ] Alert rules
- [ ] Log aggregation

### Security
- [ ] TLS/HTTPS support
- [ ] API authentication (JWT)
- [ ] Role-based access control
- [ ] Audit logging

### Storage
- [ ] Multiple storage backends
- [ ] Volume management
- [ ] Snapshots
- [ ] Cloning

## Phase 4: Advanced VM Features

### Networking
- [ ] Multiple network interfaces
- [ ] VLAN support
- [ ] Port forwarding
- [ ] NAT configuration
- [ ] DNS integration

### Live Migration
- [ ] VM state serialization
- [ ] Network migration
- [ ] Storage migration
- [ ] Zero-downtime migration

### GPU Passthrough
- [ ] GPU device detection
- [ ] VFIO configuration
- [ ] Multi-GPU support

## Performance Optimizations

- [ ] Connection pooling
- [ ] Caching layer
- [ ] Async I/O optimization
- [ ] Memory usage reduction

## Documentation

- [ ] API reference (OpenAPI/Swagger)
- [ ] User guide
- [ ] Administrator guide
- [ ] Developer guide
- [ ] Video tutorials

## Testing

- [ ] Unit tests (>80% coverage)
- [ ] Integration tests
- [ ] E2E tests
- [ ] Performance benchmarks
- [ ] Chaos testing

## Community

- [ ] Contributing guide
- [ ] Code of conduct
- [ ] Issue templates
- [ ] PR templates
- [ ] Discord/Slack community

## Release Engineering

- [ ] Automated releases
- [ ] Debian/RPM packages
- [ ] Docker images
- [ ] Homebrew formula
- [ ] Arch AUR package

## Future Considerations

- macOS support (via Hypervisor.framework)
- Windows support (via Hyper-V)
- ARM64 support
- RISC-V support
- WebAssembly runtime integration
- Container-VM hybrid mode
