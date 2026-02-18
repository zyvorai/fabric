# vmspawnd Roadmap & TODO

## ✅ Core Features (COMPLETED)

- [x] REST API daemon
- [x] CLI tool (vmctl)
- [x] TUI (vmctl-tui)
- [x] Web UI
- [x] systemd integration
- [x] Basic VM lifecycle management
- [x] State persistence

## ✅ Phase 1: Advanced Features (COMPLETED)

### ✅ WebSocket Console
- [x] WebSocket endpoint for console access
- [x] xterm.js integration in web UI
- [x] PTY streaming from systemd-vmspawn
- [x] Multiple concurrent sessions
- [ ] Console authentication (future)

**Implementation:** `backend/vmspawnd/src/websocket.rs`, `web/src/components/Terminal.tsx`

### ✅ VNC/noVNC Integration
- [x] VNC server configuration per VM
- [x] noVNC web client integration
- [x] WebSocket VNC proxy
- [ ] VNC authentication (future)
- [ ] Clipboard support (future)

**Implementation:** `backend/vnc-proxy/`, `web/src/components/VNCViewer.tsx`

### ✅ Cloud-init Support
- [x] cloud-init image generation
- [x] User-data/meta-data support
- [x] Network configuration
- [x] SSH key injection
- [x] Instance initialization

**Implementation:** `backend/cloud-init/`, API: `POST /api/vms/:name/cloud-init`

### ✅ TPM/vTPM Support
- [x] vTPM device creation
- [x] TPM state persistence
- [x] TPM 1.2 and 2.0 support
- [ ] Secure boot integration (future)
- [ ] Attestation support (future)

**Implementation:** `backend/tpm-support/`

## ✅ Phase 2: Ecosystem Integration (COMPLETED)

### ✅ Kubernetes Operator
- [x] CRD definition for VMs
- [x] Controller implementation
- [x] Status reporting
- [x] Event handling
- [x] Helm charts
- [x] cloud-init integration
- [x] TPM integration
- [x] VNC integration

**Implementation:** `operator/`

### ✅ Terraform Provider
- [x] Provider skeleton
- [x] Resource: vmspawnd_vm
- [x] Example configurations
- [x] Documentation
- [ ] Published to Terraform registry (future)

**Implementation:** `terraform-provider/`

## ✅ Phase 3: Production Features (IN PROGRESS)

### ✅ Monitoring & Metrics
- [x] Prometheus exporter
- [x] Grafana dashboards
- [x] Alert rules
- [ ] Log aggregation (future)

**Implementation:** `backend/prometheus-exporter/`, `monitoring/`

### 🚧 High Availability
- [ ] Distributed state store (etcd)
- [ ] VM migration support
- [ ] Health checks
- [ ] Automatic failover

### 🚧 Security
- [ ] TLS/HTTPS support
- [ ] API authentication (JWT)
- [ ] Role-based access control
- [ ] Audit logging

### 🚧 Storage
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

- [x] API reference
- [x] Architecture guide
- [x] Advanced features guide
- [ ] OpenAPI/Swagger spec
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

- [x] Contributing guide
- [x] LICENSE
- [ ] Code of conduct
- [ ] Issue templates
- [ ] PR templates
- [ ] Discord/Slack community

## Release Engineering

- [x] GitHub Actions CI
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

---

## 🎉 Major Milestones Achieved

1. ✅ Complete libvirt replacement functionality
2. ✅ Modern REST API with WebSocket support
3. ✅ Full stack: CLI + TUI + Web UI
4. ✅ Advanced features: cloud-init, TPM, VNC, WebSocket console
5. ✅ Kubernetes native with custom operator
6. ✅ Infrastructure as Code with Terraform provider
7. ✅ Production monitoring with Prometheus/Grafana

## Next Priority

- Security features (TLS, authentication, RBAC)
- High availability and clustering
- Storage management and snapshots
- Testing infrastructure
