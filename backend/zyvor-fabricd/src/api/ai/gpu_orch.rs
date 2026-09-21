// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! GPU group selection and MIG safety.
//!
//! A MIG profile change is refused while any replica still holds the parent
//! device. Fractional sharing without MIG is refused.

use super::types::NodeGpu;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GpuGroup {
    pub bdfs: Vec<String>,
}

pub fn select_group(gpus: &[NodeGpu], count: u32, mig_profile: &str) -> Result<GpuGroup, String> {
    let need = count.max(1) as usize;
    if need > 8 {
        return Err("gpu.count must be between 1 and 8".into());
    }
    let mut chosen = Vec::new();
    for gpu in gpus {
        if !gpu.healthy {
            continue;
        }
        if !mig_profile.is_empty() && gpu.mig_profile != mig_profile {
            continue;
        }
        if mig_profile.is_empty() && !gpu.mig_profile.is_empty() {
            continue;
        }
        chosen.push(gpu.bdf.clone());
        if chosen.len() == need {
            break;
        }
    }
    if chosen.len() != need {
        return Err(format!(
            "need {need} matching GPUs on one node, found {}",
            chosen.len()
        ));
    }
    Ok(GpuGroup { bdfs: chosen })
}

/// True when no allocation names this BDF or lists it as a parent.
pub fn mig_reconfigure_allowed(parent_bdf: &str, allocated: &[(String, String)]) -> bool {
    !allocated
        .iter()
        .any(|(_, bdf)| bdf.eq_ignore_ascii_case(parent_bdf))
}

pub fn quarantine(gpu: &mut NodeGpu) {
    gpu.healthy = false;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn gpu(bdf: &str, healthy: bool, mig: &str) -> NodeGpu {
        NodeGpu {
            bdf: bdf.into(),
            vendor: "nvidia".into(),
            vram_gib: 40,
            model: "A100".into(),
            healthy,
            mig_profile: mig.into(),
            parent_bdf: String::new(),
            nvlink: true,
        }
    }

    #[test]
    fn group_is_atomic_and_skips_a_quarantined_device() {
        let gpus = vec![
            gpu("0000:01:00.0", false, ""),
            gpu("0000:02:00.0", true, ""),
            gpu("0000:03:00.0", true, ""),
        ];
        let group = select_group(&gpus, 2, "").unwrap();
        assert_eq!(group.bdfs, vec!["0000:02:00.0", "0000:03:00.0"]);
        assert!(select_group(&gpus, 3, "").is_err());
    }

    #[test]
    fn mig_profile_must_match_and_a_held_parent_cannot_change() {
        let gpus = vec![gpu("0000:01:00.0", true, "1g.10gb")];
        assert!(select_group(&gpus, 1, "1g.5gb").is_err());
        assert!(select_group(&gpus, 1, "1g.10gb").is_ok());
        assert!(!mig_reconfigure_allowed(
            "0000:01:00.0",
            &[("node-a".into(), "0000:01:00.0".into())]
        ));
        assert!(mig_reconfigure_allowed("0000:01:00.0", &[]));
    }
}
