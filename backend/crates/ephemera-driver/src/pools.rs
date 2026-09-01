// Copyright 2026 Zyvor
// SPDX-License-Identifier: Apache-2.0

//! `PoolDriver` backed by Ephemera's warm-pool API (`/v1/pools...`) --
//! pre-boot `size` VMs from a template, pause each once ready, then hand
//! one out instantly on claim instead of a slow cold create+boot.

use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use vm_model::VM;
use zyvor_fabric_driver_core::{PoolDriver, PoolInfo};
use zyvor_fabric_ephemera_client::{BackendKind, ClaimOverrides, CreateVmRequest, PoolRecord};

use crate::lifecycle::map_status;
use crate::EphemeraDriver;

fn to_pool_info(pool: PoolRecord) -> PoolInfo {
    PoolInfo {
        name: pool.name,
        size: pool.size,
        image: pool.template.image.display().to_string(),
        cpus: pool.template.vcpus as u32,
        memory: pool.template.memory_mib,
        ready_members: pool.members.len(),
    }
}

#[async_trait]
impl PoolDriver for EphemeraDriver {
    async fn create_pool(
        &self,
        name: &str,
        size: usize,
        image: &str,
        cpus: u32,
        memory: u64,
    ) -> Result<PoolInfo> {
        let template = CreateVmRequest {
            name: name.to_string(),
            backend: BackendKind::Qemu,
            image: PathBuf::from(image),
            vcpus: cpus as u8,
            memory_mib: memory,
            disk_size_gib: None,
            kernel: None,
            initrd: None,
            firmware: None,
            kernel_args: None,
            network: Default::default(),
            cloud_init: None,
            ttl_seconds: None,
            extra_args: vec![],
            agent: None,
            shared_folders: vec![],
        };
        let pool = self.client.create_pool(name, size, template).await?;
        Ok(to_pool_info(pool))
    }

    async fn list_pools(&self) -> Result<Vec<PoolInfo>> {
        Ok(self
            .client
            .list_pools()
            .await?
            .into_iter()
            .map(to_pool_info)
            .collect())
    }

    async fn get_pool(&self, name: &str) -> Result<PoolInfo> {
        Ok(to_pool_info(self.client.get_pool(name).await?))
    }

    async fn delete_pool(&self, name: &str) -> Result<()> {
        self.client.delete_pool(name).await
    }

    async fn claim_pool(
        &self,
        pool_name: &str,
        new_name: &str,
        ttl_seconds: Option<u64>,
    ) -> Result<VM> {
        let overrides = ClaimOverrides {
            name: Some(new_name.to_string()),
            ttl_seconds,
        };
        let record = self.client.claim_pool(pool_name, overrides).await?;
        let mut vm = VM::new(
            record.name,
            record.request.image.display().to_string(),
            record.request.vcpus as u32,
            record.request.memory_mib,
        );
        vm.state = map_status(record.status);
        vm.pid = record.pid;
        Ok(vm)
    }
}
