// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Host-side model materialization for AI inference (preview).
//!
//! When `FLUXVM_AI_MODEL_DIR` is set, HF downloads are stubbed to that path
//! (with optional checksum verify). Otherwise `hf://` sources are downloaded
//! with the `huggingface_hub`-style CLI if available, using `HF_TOKEN` from
//! the host environment for private models.

use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};

/// Resolve a host-local model directory for `source`.
///
/// Returns `(local_path, verified_checksum_hex)`.
pub fn materialize_model(
    name: &str,
    source: &str,
    checksum: Option<&str>,
    state_dir: &Path,
) -> Result<(PathBuf, Option<String>), String> {
    if let Ok(stub) = std::env::var("FLUXVM_AI_MODEL_DIR") {
        let path = PathBuf::from(stub.trim());
        if !path.is_dir() {
            return Err(format!(
                "FLUXVM_AI_MODEL_DIR={} is not a directory",
                path.display()
            ));
        }
        let verified = verify_checksum_if_requested(&path, checksum)?;
        return Ok((path, verified));
    }

    if let Some(local) = source.strip_prefix("file://") {
        let path = PathBuf::from(local);
        if !path.exists() {
            return Err(format!("local model path missing: {}", path.display()));
        }
        let verified = verify_checksum_if_requested(&path, checksum)?;
        return Ok((path, verified));
    }

    if source.starts_with('/') {
        let path = PathBuf::from(source);
        if !path.exists() {
            return Err(format!("local model path missing: {}", path.display()));
        }
        let verified = verify_checksum_if_requested(&path, checksum)?;
        return Ok((path, verified));
    }

    if let Some(repo) = source.strip_prefix("hf://") {
        let dest = state_dir.join("ai-models").join(sanitize_name(name));
        std::fs::create_dir_all(&dest).map_err(|e| format!("mkdir {}: {e}", dest.display()))?;
        download_hf(repo, &dest)?;
        let verified = verify_checksum_if_requested(&dest, checksum)?;
        return Ok((dest, verified));
    }

    Err(format!(
        "unsupported model source '{source}' (use hf://, file://, absolute path, or FLUXVM_AI_MODEL_DIR)"
    ))
}

fn sanitize_name(name: &str) -> String {
    name.chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect()
}

fn download_hf(repo: &str, dest: &Path) -> Result<(), String> {
    // Prefer huggingface-cli when present; otherwise leave a marker so the
    // reconciler can surface a clear "model not ready" message without
    // pulling multi-GB blobs during unit tests / GPU-less smoke tests.
    let status = std::process::Command::new("huggingface-cli")
        .args([
            "download",
            repo,
            "--local-dir",
            &dest.to_string_lossy(),
        ])
        .env(
            "HF_TOKEN",
            std::env::var("HF_TOKEN").unwrap_or_default(),
        )
        .status();

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("huggingface-cli download failed (exit {s})")),
        Err(e) => Err(format!(
            "huggingface-cli not available ({e}); set FLUXVM_AI_MODEL_DIR to a local model tree"
        )),
    }
}

/// Verify `expected` (sha256 hex) against a file or the first regular file
/// under a directory. Returns the computed hex when verification runs.
pub fn verify_checksum_if_requested(
    path: &Path,
    expected: Option<&str>,
) -> Result<Option<String>, String> {
    let Some(expected) = expected.map(str::trim).filter(|s| !s.is_empty()) else {
        return Ok(None);
    };
    let expected = expected
        .strip_prefix("sha256:")
        .unwrap_or(expected)
        .to_ascii_lowercase();

    let file = if path.is_file() {
        path.to_path_buf()
    } else {
        find_checksum_target(path).ok_or_else(|| {
            format!(
                "no regular file under {} to verify checksum against",
                path.display()
            )
        })?
    };

    let hex = sha256_file(&file)?;
    if hex != expected {
        return Err(format!(
            "checksum mismatch for {}: expected {expected}, got {hex}",
            file.display()
        ));
    }
    Ok(Some(hex))
}

fn find_checksum_target(dir: &Path) -> Option<PathBuf> {
    let mut entries: Vec<_> = std::fs::read_dir(dir)
        .ok()?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| p.is_file())
        .collect();
    entries.sort();
    entries.into_iter().next()
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let data =
        std::fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    hasher.update(&data);
    // sha2 0.11 / digest hybrid-array: GenericArray no longer implements LowerHex.
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn checksum_verify_accepts_matching_sha256() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("weights.bin");
        {
            let mut f = std::fs::File::create(&file).unwrap();
            f.write_all(b"hello-ai").unwrap();
        }
        let hex = sha256_file(&file).unwrap();
        let verified = verify_checksum_if_requested(&file, Some(&hex))
            .unwrap()
            .unwrap();
        assert_eq!(verified, hex);
    }

    #[test]
    fn checksum_verify_rejects_mismatch() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("weights.bin");
        std::fs::write(&file, b"hello-ai").unwrap();
        let err = verify_checksum_if_requested(&file, Some("deadbeef")).unwrap_err();
        assert!(err.contains("checksum mismatch"));
    }

    #[test]
    fn materialize_uses_fluxvm_ai_model_dir_stub() {
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("FLUXVM_AI_MODEL_DIR", dir.path());
        let (path, _) = materialize_model(
            "mistral",
            "hf://mistralai/Mistral-7B-v0.1",
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        std::env::remove_var("FLUXVM_AI_MODEL_DIR");
        assert_eq!(path, dir.path());
    }
}
