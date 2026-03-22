use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use tracing::warn;
use vm_model::VM;

#[derive(Clone)]
pub struct StateStore {
    path: PathBuf,
    vms: Arc<RwLock<HashMap<String, VM>>>,
}

/// Generic entity storage helper
impl StateStore {
    /// Save any serializable entity to a subdirectory (atomic write)
    pub fn save_entity<T: Serialize>(&self, subdir: &str, id: &str, entity: &T) -> Result<()> {
        let dir = self.path.join(subdir);
        fs::create_dir_all(&dir)?;

        let file_path = dir.join(format!("{}.json", id));
        let tmp_path = dir.join(format!("{}.json.tmp", id));
        let content = serde_json::to_string_pretty(entity)?;
        fs::write(&tmp_path, content)?;
        fs::rename(&tmp_path, &file_path)?;

        Ok(())
    }

    /// Load a specific entity by ID
    pub fn get_entity<T: for<'de> Deserialize<'de>>(&self, subdir: &str, id: &str) -> Result<Option<T>> {
        let file_path = self.path.join(subdir).join(format!("{}.json", id));

        if !file_path.exists() {
            return Ok(None);
        }

        let content = fs::read_to_string(file_path)?;
        let entity = serde_json::from_str(&content)?;
        Ok(Some(entity))
    }

    /// List all entities in a subdirectory
    pub fn list_entities<T: for<'de> Deserialize<'de>>(&self, subdir: &str) -> Result<Vec<T>> {
        let dir = self.path.join(subdir);

        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut entities = Vec::new();

        for entry in fs::read_dir(&dir)? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                match fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str::<T>(&content) {
                        Ok(entity) => entities.push(entity),
                        Err(e) => {
                            warn!("Failed to deserialize entity from {}: {}", path.display(), e);
                        }
                    },
                    Err(e) => {
                        warn!("Failed to read entity file {}: {}", path.display(), e);
                    }
                }
            }
        }

        Ok(entities)
    }

    /// List entities with a filter predicate and limit, avoiding loading all into memory.
    pub fn list_entities_filtered<T, F>(
        &self,
        subdir: &str,
        predicate: F,
        limit: usize,
    ) -> Result<Vec<T>>
    where
        T: for<'de> Deserialize<'de>,
        F: Fn(&T) -> bool,
    {
        let dir = self.path.join(subdir);
        if !dir.exists() {
            return Ok(Vec::new());
        }

        let mut entities = Vec::new();
        for entry in fs::read_dir(&dir)? {
            if entities.len() >= limit {
                break;
            }
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|s| s.to_str()) == Some("json") {
                match fs::read_to_string(&path) {
                    Ok(content) => match serde_json::from_str::<T>(&content) {
                        Ok(entity) => {
                            if predicate(&entity) {
                                entities.push(entity);
                            }
                        }
                        Err(e) => {
                            warn!("Failed to deserialize entity from {}: {}", path.display(), e);
                        }
                    },
                    Err(e) => {
                        warn!("Failed to read entity file {}: {}", path.display(), e);
                    }
                }
            }
        }

        Ok(entities)
    }

    /// Delete an entity by ID
    pub fn delete_entity(&self, subdir: &str, id: &str) -> Result<()> {
        let file_path = self.path.join(subdir).join(format!("{}.json", id));

        if file_path.exists() {
            fs::remove_file(file_path)?;
        }

        Ok(())
    }
}

impl StateStore {
    pub fn new<P: AsRef<Path>>(path: P) -> Result<Self> {
        let path = path.as_ref().to_path_buf();
        fs::create_dir_all(&path)?;

        let mut vms = HashMap::new();

        // Load existing VMs from disk
        if let Ok(entries) = fs::read_dir(&path) {
            for entry in entries.flatten() {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    if let Ok(vm) = serde_json::from_str::<VM>(&content) {
                        vms.insert(vm.name.clone(), vm);
                    }
                }
            }
        }

        Ok(Self {
            path,
            vms: Arc::new(RwLock::new(vms)),
        })
    }

    pub fn save_vm(&self, vm: &VM) -> Result<()> {
        // Serialize and write file FIRST — if this fails, in-memory state stays consistent
        let content = serde_json::to_string_pretty(vm)?;
        let vm_file = self.path.join(format!("{}.json", vm.name));
        let tmp_file = self.path.join(format!("{}.json.tmp", vm.name));
        fs::write(&tmp_file, &content)?;
        fs::rename(&tmp_file, &vm_file)?;

        // Only update in-memory state after file write succeeds
        let mut vms = self
            .vms
            .write()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        vms.insert(vm.name.clone(), vm.clone());

        Ok(())
    }

    pub fn get_vm(&self, name: &str) -> Result<Option<VM>> {
        let vms = self
            .vms
            .read()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        Ok(vms.get(name).cloned())
    }

    pub fn list_vms(&self) -> Result<Vec<VM>> {
        let vms = self
            .vms
            .read()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        Ok(vms.values().cloned().collect())
    }

    /// List VMs with pagination. Returns (items, total_count).
    pub fn list_vms_paginated(&self, offset: usize, limit: usize) -> Result<(Vec<VM>, usize)> {
        let vms = self
            .vms
            .read()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        let total = vms.len();
        let items: Vec<VM> = vms.values()
            .skip(offset)
            .take(limit)
            .cloned()
            .collect();
        Ok((items, total))
    }

    /// Count VMs without cloning.
    pub fn count_vms(&self) -> Result<usize> {
        let vms = self
            .vms
            .read()
            .map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        Ok(vms.len())
    }

    pub fn delete_vm(&self, name: &str) -> Result<()> {
        // Delete file FIRST — if this fails, in-memory state stays consistent
        let vm_file = self.path.join(format!("{}.json", name));
        if vm_file.exists() {
            fs::remove_file(vm_file)?;
        }

        // Only update in-memory state after file deletion succeeds
        let mut vms = self.vms.write().map_err(|e| anyhow::anyhow!("Lock poisoned: {}", e))?;
        vms.remove(name);

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn test_store() -> (StateStore, TempDir) {
        let dir = TempDir::new().unwrap();
        let store = StateStore::new(dir.path()).unwrap();
        (store, dir)
    }

    #[test]
    fn test_save_and_load_vm() {
        let (store, _dir) = test_store();
        let vm = VM::new("test-vm".to_string(), "ubuntu.img".to_string(), 2, 1024);

        store.save_vm(&vm).unwrap();
        let loaded = store.get_vm("test-vm").unwrap();
        assert!(loaded.is_some());
        let loaded = loaded.unwrap();
        assert_eq!(loaded.name, "test-vm");
        assert_eq!(loaded.cpus, 2);
        assert_eq!(loaded.memory, 1024);
    }

    #[test]
    fn test_list_vms() {
        let (store, _dir) = test_store();
        store.save_vm(&VM::new("vm1".to_string(), "img".to_string(), 1, 512)).unwrap();
        store.save_vm(&VM::new("vm2".to_string(), "img".to_string(), 2, 1024)).unwrap();

        let vms = store.list_vms().unwrap();
        assert_eq!(vms.len(), 2);
    }

    #[test]
    fn test_delete_vm() {
        let (store, _dir) = test_store();
        store.save_vm(&VM::new("to-delete".to_string(), "img".to_string(), 1, 512)).unwrap();
        assert!(store.get_vm("to-delete").unwrap().is_some());

        store.delete_vm("to-delete").unwrap();
        assert!(store.get_vm("to-delete").unwrap().is_none());
    }

    #[test]
    fn test_get_nonexistent_vm() {
        let (store, _dir) = test_store();
        assert!(store.get_vm("nonexistent").unwrap().is_none());
    }

    #[test]
    fn test_atomic_write_creates_file() {
        let (store, dir) = test_store();
        let vm = VM::new("atomic-test".to_string(), "img".to_string(), 1, 512);
        store.save_vm(&vm).unwrap();

        let file = dir.path().join("atomic-test.json");
        assert!(file.exists());
        // Ensure no .tmp file remains
        let tmp = dir.path().join("atomic-test.json.tmp");
        assert!(!tmp.exists());
    }

    #[test]
    fn test_save_and_load_entity() {
        let (store, _dir) = test_store();

        #[derive(Debug, serde::Serialize, serde::Deserialize, PartialEq)]
        struct TestEntity {
            id: String,
            value: i32,
        }

        let entity = TestEntity {
            id: "test-1".to_string(),
            value: 42,
        };

        store.save_entity("test_entities", "test-1", &entity).unwrap();
        let loaded: Option<TestEntity> = store.get_entity("test_entities", "test-1").unwrap();
        assert!(loaded.is_some());
        assert_eq!(loaded.unwrap().value, 42);
    }

    #[test]
    fn test_list_entities() {
        let (store, _dir) = test_store();

        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct Item { name: String }

        store.save_entity("items", "a", &Item { name: "alpha".to_string() }).unwrap();
        store.save_entity("items", "b", &Item { name: "beta".to_string() }).unwrap();

        let items: Vec<Item> = store.list_entities("items").unwrap();
        assert_eq!(items.len(), 2);
    }

    #[test]
    fn test_delete_entity() {
        let (store, _dir) = test_store();

        #[derive(Debug, serde::Serialize, serde::Deserialize)]
        struct Item { name: String }

        store.save_entity("items", "x", &Item { name: "x".to_string() }).unwrap();
        store.delete_entity("items", "x").unwrap();

        let loaded: Option<Item> = store.get_entity("items", "x").unwrap();
        assert!(loaded.is_none());
    }

    #[test]
    fn test_corrupted_json_skipped() {
        let (store, dir) = test_store();

        // Write a valid entity
        store.save_entity("test", "good", &serde_json::json!({"id": "good"})).unwrap();

        // Write a corrupted file directly
        let bad_path = dir.path().join("test").join("bad.json");
        fs::write(&bad_path, "not valid json {{{").unwrap();

        // list_entities should skip the bad file
        let items: Vec<serde_json::Value> = store.list_entities("test").unwrap();
        assert_eq!(items.len(), 1);
    }

    #[test]
    fn test_concurrent_access() {
        let (store, _dir) = test_store();
        let store = Arc::new(store);

        let mut handles = vec![];
        for i in 0..10 {
            let store = store.clone();
            let handle = std::thread::spawn(move || {
                let vm = VM::new(format!("vm-{}", i), "img".to_string(), 1, 512);
                store.save_vm(&vm).unwrap();
            });
            handles.push(handle);
        }

        for handle in handles {
            handle.join().unwrap();
        }

        let vms = store.list_vms().unwrap();
        assert_eq!(vms.len(), 10);
    }

    #[test]
    fn test_persistence_across_instances() {
        let dir = TempDir::new().unwrap();

        // First instance writes
        {
            let store = StateStore::new(dir.path()).unwrap();
            store.save_vm(&VM::new("persistent".to_string(), "img".to_string(), 4, 2048)).unwrap();
        }

        // Second instance reads
        {
            let store = StateStore::new(dir.path()).unwrap();
            let vm = store.get_vm("persistent").unwrap();
            assert!(vm.is_some());
            assert_eq!(vm.unwrap().cpus, 4);
        }
    }
}
