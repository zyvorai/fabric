//! zbus proxy definitions for org.freedesktop.machine1
//!
//! Reference: <https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.machine1.html>

use zbus::proxy;

/// Proxy for the org.freedesktop.machine1.Manager interface.
///
/// This is the main entry point for interacting with machined.
/// Use `MachineManagerProxy::new(conn).await?` to create an instance.
#[proxy(
    interface = "org.freedesktop.machine1.Manager",
    default_service = "org.freedesktop.machine1",
    default_path = "/org/freedesktop/machine1"
)]
pub trait MachineManager {
    /// List all registered machines.
    ///
    /// Returns an array of (name, class, service_id, object_path).
    #[zbus(name = "ListMachines")]
    fn list_machines(&self) -> zbus::Result<Vec<(String, String, String, zbus::zvariant::OwnedObjectPath)>>;

    /// Get the object path for a machine by name.
    #[zbus(name = "GetMachine")]
    fn get_machine(&self, name: &str) -> zbus::Result<zbus::zvariant::OwnedObjectPath>;

    /// Graceful poweroff of a machine.
    #[zbus(name = "PowerOffMachine")]
    fn power_off_machine(&self, name: &str) -> zbus::Result<()>;

    /// Force-terminate a machine.
    #[zbus(name = "TerminateMachine")]
    fn terminate_machine(&self, name: &str) -> zbus::Result<()>;

    /// Send a signal to processes in a machine.
    ///
    /// `who`: "leader" or "all"
    /// `signal`: signal number (e.g. 15 for SIGTERM)
    #[zbus(name = "KillMachine")]
    fn kill_machine(&self, name: &str, who: &str, signal: i32) -> zbus::Result<()>;

    /// Get OS release info for a machine.
    #[zbus(name = "GetMachineOSRelease")]
    fn get_machine_os_release(
        &self,
        name: &str,
    ) -> zbus::Result<std::collections::HashMap<String, String>>;
}

/// Proxy for a single machine object (org.freedesktop.machine1.Machine).
///
/// Create via `MachineProxy::builder(conn).path(object_path)?.build().await?`
#[proxy(
    interface = "org.freedesktop.machine1.Machine",
    default_service = "org.freedesktop.machine1"
)]
pub trait Machine {
    /// The machine name.
    #[zbus(property)]
    fn name(&self) -> zbus::Result<String>;

    /// The machine class: "vm", "container", etc.
    #[zbus(property)]
    fn class(&self) -> zbus::Result<String>;

    /// The PID of the leader process.
    #[zbus(property)]
    fn leader(&self) -> zbus::Result<u32>;

    /// Current state: "running", "opening", "closing", etc.
    #[zbus(property)]
    fn state(&self) -> zbus::Result<String>;

    /// The service that registered this machine.
    #[zbus(property)]
    fn service(&self) -> zbus::Result<String>;

    /// Network interface indices inside the machine.
    #[zbus(property)]
    fn network_interfaces(&self) -> zbus::Result<Vec<i32>>;
}

/// Proxy for org.freedesktop.machine1.Manager image operations.
///
/// These methods live on the same Manager interface but are grouped
/// separately for clarity.
#[proxy(
    interface = "org.freedesktop.machine1.Manager",
    default_service = "org.freedesktop.machine1",
    default_path = "/org/freedesktop/machine1"
)]
pub trait ImageManager {
    /// List all images.
    ///
    /// Returns an array of (name, type, read_only, creation_time, modification_time, disk_usage, object_path).
    #[zbus(name = "ListImages")]
    fn list_images(
        &self,
    ) -> zbus::Result<Vec<(String, String, bool, u64, u64, u64, zbus::zvariant::OwnedObjectPath)>>;

    /// Clone an image.
    #[zbus(name = "CloneImage")]
    fn clone_image(&self, name: &str, new_name: &str, read_only: bool) -> zbus::Result<()>;

    /// Remove an image.
    #[zbus(name = "RemoveImage")]
    fn remove_image(&self, name: &str) -> zbus::Result<()>;

    /// Rename an image.
    #[zbus(name = "RenameImage")]
    fn rename_image(&self, name: &str, new_name: &str) -> zbus::Result<()>;

    /// Mark an image read-only or writable.
    #[zbus(name = "MarkImageReadOnly")]
    fn mark_image_read_only(&self, name: &str, read_only: bool) -> zbus::Result<()>;
}
