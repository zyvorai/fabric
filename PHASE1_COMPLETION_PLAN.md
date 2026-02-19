# Phase 1 Completion Plan — Production Ready

## Overview

Complete the remaining 15% of Phase 1 to achieve full production-ready status.

**Timeline**: 2-3 weeks
**Target**: Enterprise-grade single-node and basic cluster functionality

---

## 1. NFS Storage Pool Integration

### Goal
Support remote NFS storage for VM disks and images.

### Architecture

```rust
// backend/crates/storage/src/pool.rs
pub enum StoragePoolType {
    Local,
    Directory,
    NFS {
        server: String,
        export_path: String,
        mount_options: Vec<String>,
    },
    Ceph {  // Future Phase 2
        monitors: Vec<String>,
        pool_name: String,
    },
}

pub struct StoragePool {
    pub id: String,
    pub name: String,
    pub pool_type: StoragePoolType,
    pub path: PathBuf,
    pub capacity: u64,
    pub available: u64,
    pub state: PoolState,
    pub auto_start: bool,
}

pub enum PoolState {
    Inactive,
    Starting,
    Active,
    Stopping,
    Degraded,
}
```

### Implementation Steps

1. **Create NFS module**: `backend/crates/storage/src/nfs.rs`
2. **Add mount/unmount logic**
3. **Handle NFS-specific errors**
4. **Add health checks**

### API Endpoints

```
POST   /api/storage/pools/nfs           - Create NFS pool
POST   /api/storage/pools/:id/mount     - Mount NFS pool
POST   /api/storage/pools/:id/unmount   - Unmount NFS pool
GET    /api/storage/pools/:id/health    - Check NFS health
PUT    /api/storage/pools/:id/options   - Update mount options
```

### Dependencies

```toml
# backend/crates/storage/Cargo.toml
nfs = "0.8"
libc = "0.2"
```

### Configuration

```toml
# /etc/vmspawnd/vmspawnd.toml
[storage.pools.nfs1]
type = "nfs"
server = "192.168.1.100"
export_path = "/mnt/vm-storage"
mount_path = "/var/lib/vmspawnd/nfs/pool1"
mount_options = ["rw", "hard", "intr", "rsize=8192", "wsize=8192"]
auto_start = true
```

---

## 2. CPU Pinning Implementation

### Goal
Pin VM vCPUs to specific physical CPU cores for performance isolation.

### Architecture

```rust
// backend/crates/vm/src/config.rs
pub struct CpuConfig {
    pub count: u32,
    pub pinning: Option<CpuPinning>,
    pub shares: u32,           // CPU shares (relative weight)
    pub quota: Option<u64>,    // CPU quota in microseconds
    pub period: u64,           // CPU period (default 100000)
    pub affinity: Option<Vec<u32>>, // Physical CPU cores
}

pub enum CpuPinning {
    Auto,                      // Let scheduler decide
    Explicit(Vec<CpuPin>),     // Manual pinning
    NumaNode(u32),             // Pin to NUMA node
}

pub struct CpuPin {
    pub vcpu_id: u32,
    pub physical_cpu: u32,
}
```

### Implementation Steps

1. **Create CPU topology detection**: `backend/crates/vm/src/topology.rs`
2. **Implement pinning logic**: `backend/crates/vm/src/pinning.rs`
3. **Integrate with systemd-vmspawn**
4. **Add validation**

### Topology Detection

```rust
// backend/crates/vm/src/topology.rs
pub struct CpuTopology {
    pub total_cpus: u32,
    pub sockets: u32,
    pub cores_per_socket: u32,
    pub threads_per_core: u32,
    pub numa_nodes: Vec<NumaNode>,
}

pub struct NumaNode {
    pub id: u32,
    pub cpus: Vec<u32>,
    pub memory_mb: u64,
}

impl CpuTopology {
    pub fn detect() -> Result<Self> {
        // Read from /sys/devices/system/cpu/
        // Parse topology
    }
}
```

### systemd Integration

```rust
// backend/crates/vm/src/spawn.rs
fn apply_cpu_pinning(vm: &VM, pinning: &CpuPinning) -> Result<()> {
    match pinning {
        CpuPinning::Explicit(pins) => {
            for pin in pins {
                // Use systemd CPUAffinity
                Command::new("systemctl")
                    .args(&[
                        "set-property",
                        &format!("systemd-vmspawn@{}.service", vm.name),
                        &format!("CPUAffinity={}", pin.physical_cpu),
                    ])
                    .output()?;
            }
        }
        CpuPinning::NumaNode(node_id) => {
            let topology = CpuTopology::detect()?;
            let node = topology.numa_nodes.iter()
                .find(|n| n.id == *node_id)
                .ok_or(Error::InvalidNumaNode)?;

            let affinity = node.cpus.iter()
                .map(|c| c.to_string())
                .collect::<Vec<_>>()
                .join(",");

            Command::new("systemctl")
                .args(&[
                    "set-property",
                    &format!("systemd-vmspawn@{}.service", vm.name),
                    &format!("CPUAffinity={}", affinity),
                ])
                .output()?;
        }
        CpuPinning::Auto => {
            // No pinning
        }
    }
    Ok(())
}
```

### API Endpoints

```
GET    /api/system/cpu/topology          - Get CPU topology
POST   /api/vms/:name/cpu/pin            - Set CPU pinning
DELETE /api/vms/:name/cpu/pin            - Remove CPU pinning
GET    /api/vms/:name/cpu/affinity       - Get current affinity
```

### Web UI

```typescript
// web/src/components/CpuPinningDialog.tsx
interface CpuPinningDialogProps {
  vm: VM
  topology: CpuTopology
  onSave: (pinning: CpuPinning) => void
}

// Visual CPU core selector with NUMA node grouping
```

---

## 3. Memory Limits Enforcement

### Goal
Enforce hard memory limits and enable memory overcommit controls.

### Architecture

```rust
// backend/crates/vm/src/config.rs
pub struct MemoryConfig {
    pub size_mb: u64,
    pub max_mb: Option<u64>,        // Hard limit
    pub balloon: bool,               // Enable ballooning
    pub hugepages: Option<HugepageSize>,
    pub numa_node: Option<u32>,      // NUMA placement
    pub overcommit: OvercommitPolicy,
}

pub enum HugepageSize {
    Size2MB,
    Size1GB,
}

pub enum OvercommitPolicy {
    None,           // No overcommit
    Conservative,   // 1.5x overcommit
    Aggressive,     // 2x overcommit
}
```

### Implementation Steps

1. **Create memory controller**: `backend/crates/vm/src/memory.rs`
2. **Integrate with cgroups v2**
3. **Implement memory ballooning**
4. **Add hugepage support**

### cgroups Integration

```rust
// backend/crates/vm/src/memory.rs
pub struct MemoryController {
    cgroup_path: PathBuf,
}

impl MemoryController {
    pub fn new(vm_name: &str) -> Self {
        Self {
            cgroup_path: PathBuf::from(format!(
                "/sys/fs/cgroup/machine.slice/vmspawn-{}.scope",
                vm_name
            )),
        }
    }

    pub fn set_limit(&self, limit_bytes: u64) -> Result<()> {
        let limit_path = self.cgroup_path.join("memory.max");
        fs::write(limit_path, limit_bytes.to_string())?;
        Ok(())
    }

    pub fn set_swap_limit(&self, limit_bytes: u64) -> Result<()> {
        let swap_path = self.cgroup_path.join("memory.swap.max");
        fs::write(swap_path, limit_bytes.to_string())?;
        Ok(())
    }

    pub fn get_current_usage(&self) -> Result<u64> {
        let usage_path = self.cgroup_path.join("memory.current");
        let usage = fs::read_to_string(usage_path)?;
        Ok(usage.trim().parse()?)
    }

    pub fn enable_oom_killer(&self, enable: bool) -> Result<()> {
        let oom_path = self.cgroup_path.join("memory.oom.group");
        fs::write(oom_path, if enable { "1" } else { "0" })?;
        Ok(())
    }
}
```

### Hugepage Support

```rust
// backend/crates/vm/src/hugepages.rs
pub fn allocate_hugepages(size: HugepageSize, count: u32) -> Result<()> {
    let (path, page_size) = match size {
        HugepageSize::Size2MB => ("/sys/kernel/mm/hugepages/hugepages-2048kB", 2048),
        HugepageSize::Size1GB => ("/sys/kernel/mm/hugepages/hugepages-1048576kB", 1048576),
    };

    let nr_path = format!("{}/nr_hugepages", path);
    let current: u32 = fs::read_to_string(&nr_path)?.trim().parse()?;
    let needed = current + count;

    fs::write(nr_path, needed.to_string())?;
    Ok(())
}
```

### API Endpoints

```
PUT    /api/vms/:name/memory/limit       - Set memory limit
GET    /api/vms/:name/memory/usage       - Get current usage
POST   /api/vms/:name/memory/balloon     - Enable/disable ballooning
GET    /api/system/memory/hugepages      - Get hugepage info
POST   /api/system/memory/hugepages      - Allocate hugepages
```

---

## 4. NUMA Topology Awareness

### Goal
Detect NUMA topology and optimize VM placement.

### Architecture

```rust
// backend/crates/system/src/numa.rs
pub struct NumaTopology {
    pub nodes: Vec<NumaNode>,
    pub distances: Vec<Vec<u32>>,  // Inter-node distances
}

pub struct NumaNode {
    pub id: u32,
    pub cpus: Vec<u32>,
    pub memory_total_mb: u64,
    pub memory_free_mb: u64,
    pub hugepages_2mb: u32,
    pub hugepages_1gb: u32,
}

impl NumaTopology {
    pub fn detect() -> Result<Self> {
        let mut nodes = Vec::new();

        for entry in fs::read_dir("/sys/devices/system/node")? {
            let entry = entry?;
            let name = entry.file_name();
            let name_str = name.to_str().unwrap();

            if name_str.starts_with("node") {
                let node_id: u32 = name_str[4..].parse()?;
                let node = Self::parse_node(node_id)?;
                nodes.push(node);
            }
        }

        let distances = Self::parse_distances(nodes.len())?;

        Ok(Self { nodes, distances })
    }

    fn parse_node(id: u32) -> Result<NumaNode> {
        let base = PathBuf::from(format!("/sys/devices/system/node/node{}", id));

        // Read CPU list
        let cpulist = fs::read_to_string(base.join("cpulist"))?;
        let cpus = Self::parse_cpulist(&cpulist)?;

        // Read memory info
        let meminfo = fs::read_to_string(base.join("meminfo"))?;
        let (total, free) = Self::parse_meminfo(&meminfo)?;

        Ok(NumaNode {
            id,
            cpus,
            memory_total_mb: total / 1024,
            memory_free_mb: free / 1024,
            hugepages_2mb: 0,  // Parse from hugepages dir
            hugepages_1gb: 0,
        })
    }

    fn parse_cpulist(cpulist: &str) -> Result<Vec<u32>> {
        let mut cpus = Vec::new();
        for part in cpulist.trim().split(',') {
            if part.contains('-') {
                let range: Vec<&str> = part.split('-').collect();
                let start: u32 = range[0].parse()?;
                let end: u32 = range[1].parse()?;
                for cpu in start..=end {
                    cpus.push(cpu);
                }
            } else {
                cpus.push(part.parse()?);
            }
        }
        Ok(cpus)
    }

    pub fn find_best_node(&self, memory_mb: u64, cpus: u32) -> Option<u32> {
        self.nodes.iter()
            .filter(|n| {
                n.memory_free_mb >= memory_mb &&
                n.cpus.len() >= cpus as usize
            })
            .max_by_key(|n| n.memory_free_mb)
            .map(|n| n.id)
    }
}
```

### Scheduler Integration

```rust
// backend/crates/scheduler/src/numa_aware.rs
pub struct NumaAwareScheduler {
    topology: NumaTopology,
}

impl NumaAwareScheduler {
    pub fn place_vm(&self, vm: &VM) -> Result<Placement> {
        let best_node = self.topology
            .find_best_node(vm.memory_mb, vm.cpus)
            .ok_or(Error::NoSuitableNode)?;

        Ok(Placement {
            numa_node: best_node,
            cpu_affinity: self.topology.nodes[best_node as usize].cpus.clone(),
        })
    }
}
```

### API Endpoints

```
GET    /api/system/numa/topology          - Get NUMA topology
GET    /api/system/numa/nodes/:id         - Get node details
POST   /api/vms/:name/numa/bind           - Bind to NUMA node
```

---

## 5. Secure Boot (OVMF) Support

### Goal
Enable UEFI Secure Boot for VMs using OVMF firmware.

### Architecture

```rust
// backend/crates/vm/src/firmware.rs
pub enum Firmware {
    BIOS,
    UEFI {
        secure_boot: bool,
        vars_file: PathBuf,
        code_file: PathBuf,
    },
}

pub struct OvmfConfig {
    pub code_path: PathBuf,      // /usr/share/OVMF/OVMF_CODE.fd
    pub vars_path: PathBuf,      // /var/lib/vmspawnd/vms/{name}/OVMF_VARS.fd
    pub secure_boot: bool,
    pub tpm_version: Option<TpmVersion>,
}

impl OvmfConfig {
    pub fn new(vm_name: &str, secure_boot: bool) -> Self {
        let code_path = if secure_boot {
            PathBuf::from("/usr/share/OVMF/OVMF_CODE.secboot.fd")
        } else {
            PathBuf::from("/usr/share/OVMF/OVMF_CODE.fd")
        };

        let vars_template = if secure_boot {
            PathBuf::from("/usr/share/OVMF/OVMF_VARS.secboot.fd")
        } else {
            PathBuf::from("/usr/share/OVMF/OVMF_VARS.fd")
        };

        let vars_path = PathBuf::from(format!(
            "/var/lib/vmspawnd/vms/{}/OVMF_VARS.fd",
            vm_name
        ));

        // Copy template to VM-specific vars file
        if !vars_path.exists() {
            fs::copy(&vars_template, &vars_path).unwrap();
        }

        Self {
            code_path,
            vars_path,
            secure_boot,
            tpm_version: None,
        }
    }

    pub fn to_qemu_args(&self) -> Vec<String> {
        vec![
            "-drive".to_string(),
            format!(
                "if=pflash,format=raw,readonly=on,file={}",
                self.code_path.display()
            ),
            "-drive".to_string(),
            format!(
                "if=pflash,format=raw,file={}",
                self.vars_path.display()
            ),
        ]
    }
}
```

### systemd-vmspawn Integration

```rust
// backend/crates/vm/src/spawn.rs
impl VmSpawner {
    fn build_command_with_uefi(&self, vm: &VM, ovmf: &OvmfConfig) -> Command {
        let mut cmd = Command::new("systemd-vmspawn");

        // Add OVMF firmware
        cmd.arg("--firmware").arg(&ovmf.code_path);
        cmd.arg("--firmware-vars").arg(&ovmf.vars_path);

        if ovmf.secure_boot {
            cmd.arg("--secure-boot");
        }

        // Add TPM if configured
        if let Some(tpm) = &ovmf.tpm_version {
            cmd.arg("--tpm").arg(tpm.to_string());
        }

        cmd
    }
}
```

### API Endpoints

```
POST   /api/vms/:name/firmware/uefi       - Enable UEFI
POST   /api/vms/:name/firmware/secureboot - Enable Secure Boot
GET    /api/vms/:name/firmware/status     - Get firmware status
POST   /api/vms/:name/firmware/reset      - Reset NVRAM vars
```

### Web UI

```typescript
// web/src/components/FirmwareSettings.tsx
interface FirmwareSettingsProps {
  vm: VM
}

// Toggle BIOS/UEFI
// Enable/disable Secure Boot
// Show firmware version
// Reset NVRAM option
```

---

## Testing Strategy

### Unit Tests

```rust
// backend/crates/storage/tests/nfs_test.rs
#[tokio::test]
async fn test_nfs_mount() {
    let pool = create_nfs_pool("nfs1", "192.168.1.100:/export").await;
    assert!(pool.is_ok());
}

// backend/crates/vm/tests/cpu_pinning_test.rs
#[test]
fn test_cpu_topology_detection() {
    let topology = CpuTopology::detect().unwrap();
    assert!(topology.total_cpus > 0);
}
```

### Integration Tests

```rust
// backend/tests/phase1_integration.rs
#[tokio::test]
async fn test_vm_with_cpu_pinning() {
    let vm = create_vm_with_pinning().await;
    assert_eq!(vm.cpu_config.pinning, Some(CpuPinning::Auto));
}

#[tokio::test]
async fn test_vm_with_numa_binding() {
    let vm = create_vm_with_numa(0).await;
    assert!(vm.is_running());
}
```

---

## Documentation Updates

### User Guides

1. **NFS_STORAGE_GUIDE.md** - NFS setup and configuration
2. **CPU_PINNING_GUIDE.md** - CPU pinning best practices
3. **MEMORY_MANAGEMENT_GUIDE.md** - Memory limits and hugepages
4. **NUMA_OPTIMIZATION_GUIDE.md** - NUMA-aware deployment
5. **SECURE_BOOT_GUIDE.md** - UEFI and Secure Boot setup

### API Documentation

Update **REST_API.md** with all new endpoints.

### Configuration Examples

```toml
# /etc/vmspawnd/vmspawnd.toml

[vm.defaults]
firmware = "uefi"
secure_boot = true
numa_aware = true

[storage.pools.nfs1]
type = "nfs"
server = "storage.local"
export_path = "/vm-storage"
mount_options = ["rw", "hard", "intr"]

[memory]
enable_hugepages = true
hugepage_size = "2MB"
overcommit_policy = "conservative"

[cpu]
enable_pinning = true
numa_aware_placement = true
```

---

## Milestones

### Week 1
- ✅ NFS storage pool implementation
- ✅ API endpoints for NFS
- ✅ Basic tests

### Week 2
- ✅ CPU pinning implementation
- ✅ Memory limits enforcement
- ✅ NUMA topology detection
- ✅ Integration tests

### Week 3
- ✅ Secure Boot (OVMF) support
- ✅ Web UI updates
- ✅ Documentation
- ✅ Final testing

---

## Success Criteria

- [ ] NFS pools can be created, mounted, and used for VM storage
- [ ] VMs can be pinned to specific CPU cores or NUMA nodes
- [ ] Memory limits are enforced via cgroups v2
- [ ] NUMA topology is detected and used for optimal placement
- [ ] VMs can boot with UEFI and Secure Boot
- [ ] All features have unit and integration tests
- [ ] Documentation is complete and accurate
- [ ] Web UI supports all new features

---

## Next: Phase 2 Preparation

Once Phase 1 is complete, prepare for Phase 2:

1. Ceph storage integration design
2. Live migration protocol design
3. Distributed scheduler architecture
4. Multi-node testing environment

---

**End of Phase 1 Completion Plan**
