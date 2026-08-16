// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

//! `ImageDriver` backed by machinectl's `/var/lib/machines` image
//! directory, via `zyvor_fabric_vm_driver::machinectl` (blocking CLI calls
//! — each wrapped in `spawn_blocking`, matching `lifecycle.rs::start_with_options`).

use anyhow::Result;
use async_trait::async_trait;
use zyvor_fabric_driver_core::{ImageDriver, ImageInfo};

use crate::MachinectlDriver;

fn to_image_info(i: zyvor_fabric_vm_driver::machinectl::ImageInfo) -> ImageInfo {
    ImageInfo { name: i.name, image_type: i.image_type, read_only: i.read_only, size: i.size }
}

macro_rules! blocking {
    ($body:expr) => {
        tokio::task::spawn_blocking(move || $body)
            .await
            .map_err(|e| anyhow::anyhow!("blocking task panicked: {e}"))?
    };
}

#[async_trait]
impl ImageDriver for MachinectlDriver {
    async fn list_images(&self) -> Result<Vec<ImageInfo>> {
        let images = blocking!(zyvor_fabric_vm_driver::machinectl::list_images())?;
        Ok(images.into_iter().map(to_image_info).collect())
    }

    async fn clone_image(&self, source: &str, target: &str) -> Result<()> {
        let (source, target) = (source.to_string(), target.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::clone_image(&source, &target))
    }

    async fn rename_image(&self, old_name: &str, new_name: &str) -> Result<()> {
        let (old_name, new_name) = (old_name.to_string(), new_name.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::rename_image(&old_name, &new_name))
    }

    async fn remove_image(&self, name: &str) -> Result<()> {
        let name = name.to_string();
        blocking!(zyvor_fabric_vm_driver::machinectl::remove_image(&name))
    }

    async fn set_image_read_only(&self, name: &str, read_only: bool) -> Result<()> {
        let name = name.to_string();
        blocking!(zyvor_fabric_vm_driver::machinectl::set_read_only(&name, read_only))
    }

    async fn pull_raw_image(&self, url: &str, name: &str, verify: bool) -> Result<()> {
        let (url, name) = (url.to_string(), name.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::pull_raw(&url, &name, verify))
    }

    async fn pull_tar_image(&self, url: &str, name: &str, verify: bool) -> Result<()> {
        let (url, name) = (url.to_string(), name.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::pull_tar(&url, &name, verify))
    }

    async fn import_raw_image(&self, path: &str, name: &str) -> Result<()> {
        let (path, name) = (path.to_string(), name.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::import_raw(&path, &name))
    }

    async fn import_tar_image(&self, path: &str, name: &str) -> Result<()> {
        let (path, name) = (path.to_string(), name.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::import_tar(&path, &name))
    }

    async fn export_raw_image(&self, name: &str, path: &str) -> Result<()> {
        let (name, path) = (name.to_string(), path.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::export_raw(&name, &path))
    }

    async fn export_tar_image(&self, name: &str, path: &str) -> Result<()> {
        let (name, path) = (name.to_string(), path.to_string());
        blocking!(zyvor_fabric_vm_driver::machinectl::export_tar(&name, &path))
    }

    async fn clean_images(&self, all: bool) -> Result<()> {
        blocking!(zyvor_fabric_vm_driver::machinectl::clean(all))
    }
}
