use anyhow::Result;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};
use vm_model::VM;

#[derive(Clone)]
pub struct StateStore {
    path: PathBuf,
    vms: Arc<RwLock<HashMap<String, VM>>>,
}

/// Generic entity storage helper
impl StateStore {
    /// Save any serializable entity to a subdirectory
    pub fn save_entity<T: Serialize>(&self, subdir: &str, id: &str, entity: &T) -> Result<()> {
        let dir = self.path.join(subdir);
        fs::create_dir_all(&dir)?;

        let file_path = dir.join(format!("{}.json", id));
        let content = serde_json::to_string_pretty(entity)?;
        fs::write(file_path, content)?;

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
            if entry.path().extension().and_then(|s| s.to_str()) == Some("json") {
                if let Ok(content) = fs::read_to_string(entry.path()) {
                    if let Ok(entity) = serde_json::from_str::<T>(&content) {
                        entities.push(entity);
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
        let mut vms = self.vms.write().unwrap();
        vms.insert(vm.name.clone(), vm.clone());

        let vm_file = self.path.join(format!("{}.json", vm.name));
        let content = serde_json::to_string_pretty(vm)?;
        fs::write(vm_file, content)?;

        Ok(())
    }

    pub fn get_vm(&self, name: &str) -> Result<Option<VM>> {
        let vms = self.vms.read().unwrap();
        Ok(vms.get(name).cloned())
    }

    pub fn list_vms(&self) -> Result<Vec<VM>> {
        let vms = self.vms.read().unwrap();
        Ok(vms.values().cloned().collect())
    }

    pub fn delete_vm(&self, name: &str) -> Result<()> {
        let mut vms = self.vms.write().unwrap();
        vms.remove(name);

        let vm_file = self.path.join(format!("{}.json", name));
        if vm_file.exists() {
            fs::remove_file(vm_file)?;
        }

        Ok(())
    }
}
