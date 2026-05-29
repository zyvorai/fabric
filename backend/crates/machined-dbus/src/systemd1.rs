// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! zbus proxy definitions for org.freedesktop.systemd1
//!
//! Reference: <https://www.freedesktop.org/software/systemd/man/latest/org.freedesktop.systemd1.html>

use zbus::proxy;
use zbus::zvariant::OwnedObjectPath;

/// Proxy for the org.freedesktop.systemd1.Manager interface.
#[proxy(
    interface = "org.freedesktop.systemd1.Manager",
    default_service = "org.freedesktop.systemd1",
    default_path = "/org/freedesktop/systemd1"
)]
pub trait SystemdManager {
    /// Start a unit.
    ///
    /// `mode` is typically "replace" or "fail".
    #[zbus(name = "StartUnit")]
    fn start_unit(&self, name: &str, mode: &str) -> zbus::Result<OwnedObjectPath>;

    /// Stop a unit.
    #[zbus(name = "StopUnit")]
    fn stop_unit(&self, name: &str, mode: &str) -> zbus::Result<OwnedObjectPath>;

    /// Get the object path for a loaded unit.
    #[zbus(name = "GetUnit")]
    fn get_unit(&self, name: &str) -> zbus::Result<OwnedObjectPath>;

    /// Set runtime properties on a unit.
    ///
    /// If `runtime` is true, changes are transient (lost on reboot).
    #[zbus(name = "SetUnitProperties")]
    fn set_unit_properties(
        &self,
        name: &str,
        runtime: bool,
        properties: &[(&str, zbus::zvariant::Value<'_>)],
    ) -> zbus::Result<()>;
}

/// Proxy for a single unit (org.freedesktop.systemd1.Unit).
///
/// Create via `SystemdUnitProxy::builder(conn).path(unit_path)?.build().await?`
#[proxy(
    interface = "org.freedesktop.systemd1.Unit",
    default_service = "org.freedesktop.systemd1"
)]
pub trait SystemdUnit {
    /// The active state: "active", "inactive", "activating", "deactivating", "failed".
    #[zbus(property)]
    fn active_state(&self) -> zbus::Result<String>;

    /// The sub-state: "running", "dead", etc.
    #[zbus(property)]
    fn sub_state(&self) -> zbus::Result<String>;

    /// The load state: "loaded", "not-found", "error", etc.
    #[zbus(property)]
    fn load_state(&self) -> zbus::Result<String>;
}
