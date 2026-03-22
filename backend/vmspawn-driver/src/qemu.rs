use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use std::process::Command;

/// QEMU machine types
#[derive(Debug, Clone)]
pub enum MachineType {
    Q35,
    Pc,
    Virt,
    MicroVM,
}

impl MachineType {
    pub fn as_str(&self) -> &str {
        match self {
            MachineType::Q35 => "q35",
            MachineType::Pc => "pc",
            MachineType::Virt => "virt",
            MachineType::MicroVM => "microvm",
        }
    }
}

/// QEMU accelerator options
#[derive(Debug, Clone)]
pub enum Accel {
    Kvm,
    Tcg,
    Auto,
}

impl Accel {
    pub fn as_str(&self) -> &str {
        match self {
            Accel::Kvm => "kvm",
            Accel::Tcg => "tcg",
            Accel::Auto => "kvm:tcg",
        }
    }
}

/// QEMU disk configuration
#[derive(Debug, Clone)]
pub struct QemuDisk {
    pub path: PathBuf,
    pub format: String,
    pub interface: String,
    pub index: u32,
    pub readonly: bool,
}

/// QEMU network configuration
#[derive(Debug, Clone)]
pub struct QemuNetwork {
    pub model: String,
    pub bridge: Option<String>,
    pub mac: Option<String>,
    pub tap: Option<String>,
}

/// QEMU display configuration
#[derive(Debug, Clone)]
pub enum QemuDisplay {
    None,
    Vnc { port: u16 },
    Spice { port: u16 },
    Gtk,
}

/// Builder for constructing QEMU command lines
pub struct QemuBuilder {
    binary: String,
    name: String,
    machine: MachineType,
    accel: Accel,
    cpus: u32,
    memory_mb: u64,
    cpu_model: String,
    smp_options: Option<String>,
    disks: Vec<QemuDisk>,
    networks: Vec<QemuNetwork>,
    display: QemuDisplay,
    qmp_socket: Option<PathBuf>,
    serial: Option<String>,
    uefi_firmware: Option<PathBuf>,
    daemonize: bool,
    pidfile: Option<PathBuf>,
    extra_args: Vec<String>,
}

impl QemuBuilder {
    pub fn new(name: &str) -> Self {
        Self {
            binary: detect_qemu_binary(),
            name: name.to_string(),
            machine: MachineType::Q35,
            accel: Accel::Auto,
            cpus: 1,
            memory_mb: 1024,
            cpu_model: "host".to_string(),
            smp_options: None,
            disks: Vec::new(),
            networks: Vec::new(),
            display: QemuDisplay::None,
            qmp_socket: None,
            serial: None,
            uefi_firmware: None,
            daemonize: true,
            pidfile: None,
            extra_args: Vec::new(),
        }
    }

    pub fn machine(mut self, machine: MachineType) -> Self {
        self.machine = machine;
        self
    }

    pub fn accel(mut self, accel: Accel) -> Self {
        self.accel = accel;
        self
    }

    pub fn cpus(mut self, cpus: u32) -> Self {
        self.cpus = cpus;
        self
    }

    pub fn memory(mut self, memory_mb: u64) -> Self {
        self.memory_mb = memory_mb;
        self
    }

    pub fn cpu_model(mut self, model: &str) -> Self {
        self.cpu_model = model.to_string();
        self
    }

    pub fn smp(mut self, sockets: u32, cores: u32, threads: u32) -> Self {
        self.smp_options = Some(format!(
            "sockets={},cores={},threads={}",
            sockets, cores, threads
        ));
        self
    }

    pub fn add_disk(mut self, disk: QemuDisk) -> Self {
        self.disks.push(disk);
        self
    }

    pub fn add_disk_simple(mut self, path: &Path, format: &str) -> Self {
        let index = self.disks.len() as u32;
        self.disks.push(QemuDisk {
            path: path.to_path_buf(),
            format: format.to_string(),
            interface: "virtio".to_string(),
            index,
            readonly: false,
        });
        self
    }

    pub fn add_network(mut self, network: QemuNetwork) -> Self {
        self.networks.push(network);
        self
    }

    pub fn add_bridge_network(mut self, bridge: &str) -> Self {
        self.networks.push(QemuNetwork {
            model: "virtio-net-pci".to_string(),
            bridge: Some(bridge.to_string()),
            mac: None,
            tap: None,
        });
        self
    }

    pub fn add_user_network(mut self) -> Self {
        self.networks.push(QemuNetwork {
            model: "virtio-net-pci".to_string(),
            bridge: None,
            mac: None,
            tap: None,
        });
        self
    }

    pub fn display(mut self, display: QemuDisplay) -> Self {
        self.display = display;
        self
    }

    pub fn qmp_socket(mut self, path: &Path) -> Self {
        self.qmp_socket = Some(path.to_path_buf());
        self
    }

    pub fn serial_console(mut self) -> Self {
        self.serial = Some("mon:stdio".to_string());
        self
    }

    pub fn uefi(mut self, firmware_path: &Path) -> Self {
        self.uefi_firmware = Some(firmware_path.to_path_buf());
        self
    }

    pub fn daemonize(mut self, daemonize: bool) -> Self {
        self.daemonize = daemonize;
        self
    }

    pub fn pidfile(mut self, path: &Path) -> Self {
        self.pidfile = Some(path.to_path_buf());
        self
    }

    pub fn extra_arg(mut self, arg: &str) -> Self {
        self.extra_args.push(arg.to_string());
        self
    }

    /// Build the QEMU command line arguments
    pub fn build_args(&self) -> Vec<String> {
        let mut args = Vec::new();

        // Machine and accelerator
        args.extend_from_slice(&[
            "-machine".to_string(),
            format!("{},accel={}", self.machine.as_str(), self.accel.as_str()),
        ]);

        // Name
        args.extend_from_slice(&["-name".to_string(), self.name.clone()]);

        // CPU
        args.extend_from_slice(&["-cpu".to_string(), self.cpu_model.clone()]);

        // SMP
        if let Some(ref smp) = self.smp_options {
            args.extend_from_slice(&["-smp".to_string(), smp.clone()]);
        } else {
            args.extend_from_slice(&["-smp".to_string(), self.cpus.to_string()]);
        }

        // Memory
        args.extend_from_slice(&["-m".to_string(), format!("{}M", self.memory_mb)]);

        // UEFI firmware
        if let Some(ref firmware) = self.uefi_firmware {
            args.extend_from_slice(&[
                "-drive".to_string(),
                format!("if=pflash,format=raw,readonly=on,file={}", firmware.display()),
            ]);
        }

        // Disks
        for disk in &self.disks {
            let mut drive = format!(
                "file={},format={},if={},index={}",
                disk.path.display(),
                disk.format,
                disk.interface,
                disk.index
            );
            if disk.readonly {
                drive.push_str(",readonly=on");
            }
            args.extend_from_slice(&["-drive".to_string(), drive]);
        }

        // Networks
        for (i, net) in self.networks.iter().enumerate() {
            args.extend_from_slice(&[
                "-device".to_string(),
                format!("{},netdev=net{}", net.model, i),
            ]);

            if let Some(ref bridge) = net.bridge {
                args.extend_from_slice(&[
                    "-netdev".to_string(),
                    format!("bridge,id=net{},br={}", i, bridge),
                ]);
            } else if let Some(ref tap) = net.tap {
                args.extend_from_slice(&[
                    "-netdev".to_string(),
                    format!("tap,id=net{},ifname={},script=no,downscript=no", i, tap),
                ]);
            } else {
                args.extend_from_slice(&[
                    "-netdev".to_string(),
                    format!("user,id=net{}", i),
                ]);
            }
        }

        // Display
        match &self.display {
            QemuDisplay::None => {
                args.extend_from_slice(&["-display".to_string(), "none".to_string()]);
            }
            QemuDisplay::Vnc { port } => {
                args.extend_from_slice(&[
                    "-vnc".to_string(),
                    format!(":{}", port - 5900),
                ]);
            }
            QemuDisplay::Spice { port } => {
                args.extend_from_slice(&[
                    "-spice".to_string(),
                    format!("port={}", port),
                ]);
            }
            QemuDisplay::Gtk => {
                args.extend_from_slice(&["-display".to_string(), "gtk".to_string()]);
            }
        }

        // QMP socket
        if let Some(ref qmp) = self.qmp_socket {
            args.extend_from_slice(&[
                "-qmp".to_string(),
                format!("unix:{},server,nowait", qmp.display()),
            ]);
        }

        // Serial
        if let Some(ref serial) = self.serial {
            args.extend_from_slice(&["-serial".to_string(), serial.clone()]);
        }

        // Daemonize
        if self.daemonize {
            args.push("-daemonize".to_string());
        }

        // PID file
        if let Some(ref pidfile) = self.pidfile {
            args.extend_from_slice(&["-pidfile".to_string(), pidfile.display().to_string()]);
        }

        // Extra args
        args.extend(self.extra_args.clone());

        args
    }

    /// Launch the QEMU process
    pub fn launch(&self) -> Result<u32> {
        let args = self.build_args();

        tracing::info!("Launching QEMU: {} {}", self.binary, args.join(" "));

        let child = Command::new(&self.binary)
            .args(&args)
            .spawn()
            .map_err(|e| anyhow!("Failed to launch QEMU: {}", e))?;

        let pid = child.id();

        // If daemonized, the process will exit immediately and the
        // actual QEMU runs in background. Read PID from pidfile if set.
        if self.daemonize {
            if let Some(ref pidfile) = self.pidfile {
                // Poll for pidfile with timeout instead of fixed sleep
                let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
                while std::time::Instant::now() < deadline {
                    if let Ok(content) = std::fs::read_to_string(pidfile) {
                        if let Ok(real_pid) = content.trim().parse::<u32>() {
                            return Ok(real_pid);
                        }
                    }
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }
            }
        }

        Ok(pid)
    }

    /// Build the command without executing it (for inspection/testing)
    pub fn build_command(&self) -> String {
        let args = self.build_args();
        format!("{} {}", self.binary, args.join(" "))
    }
}

/// Detect the appropriate QEMU binary for the current architecture
fn detect_qemu_binary() -> String {
    let candidates = [
        "qemu-system-x86_64",
        "qemu-system-aarch64",
        "/usr/bin/qemu-system-x86_64",
        "/usr/libexec/qemu-kvm",
    ];

    for candidate in &candidates {
        if Command::new("which")
            .arg(candidate)
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return candidate.to_string();
        }
    }

    "qemu-system-x86_64".to_string()
}

/// Check if KVM acceleration is available
pub fn kvm_available() -> bool {
    Path::new("/dev/kvm").exists()
}

/// Create a QEMU disk image
pub fn create_disk_image(path: &Path, format: &str, size_gb: u64) -> Result<()> {
    let output = Command::new("qemu-img")
        .args([
            "create",
            "-f",
            format,
            &path.display().to_string(),
            &format!("{}G", size_gb),
        ])
        .output()
        .map_err(|e| anyhow!("Failed to run qemu-img: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow!("qemu-img create failed: {}", stderr));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_qemu_builder_basic() {
        let builder = QemuBuilder::new("test-vm")
            .cpus(2)
            .memory(2048)
            .machine(MachineType::Q35)
            .accel(Accel::Kvm);

        let cmd = builder.build_command();
        assert!(cmd.contains("-name test-vm"));
        assert!(cmd.contains("-smp 2"));
        assert!(cmd.contains("-m 2048M"));
        assert!(cmd.contains("q35,accel=kvm"));
    }

    #[test]
    fn test_qemu_builder_with_disk() {
        let builder = QemuBuilder::new("test-vm")
            .add_disk_simple(Path::new("/tmp/test.qcow2"), "qcow2");

        let cmd = builder.build_command();
        assert!(cmd.contains("file=/tmp/test.qcow2,format=qcow2"));
    }

    #[test]
    fn test_qemu_builder_with_network() {
        let builder = QemuBuilder::new("test-vm")
            .add_bridge_network("br0");

        let cmd = builder.build_command();
        assert!(cmd.contains("virtio-net-pci"));
        assert!(cmd.contains("bridge,id=net0,br=br0"));
    }

    #[test]
    fn test_qemu_builder_smp_topology() {
        let builder = QemuBuilder::new("test-vm")
            .smp(1, 4, 2);

        let cmd = builder.build_command();
        assert!(cmd.contains("sockets=1,cores=4,threads=2"));
    }

    #[test]
    fn test_qemu_builder_vnc() {
        let builder = QemuBuilder::new("test-vm")
            .display(QemuDisplay::Vnc { port: 5901 });

        let cmd = builder.build_command();
        assert!(cmd.contains("-vnc :1"));
    }

    #[test]
    fn test_kvm_detection() {
        // Just ensure it doesn't panic
        let _ = kvm_available();
    }
}
