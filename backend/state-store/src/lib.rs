use anyhow::Result;
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
