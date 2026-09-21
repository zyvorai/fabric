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
/// The resolved path must stay under `FLUXVM_AI_MODEL_DIR` or
/// `{state_dir}/ai-models` after canonicalization. `revision` is forwarded
/// to `huggingface-cli download --revision` for `hf://` sources.
///
/// Returns `(local_path, verified_checksum_hex)`.
pub fn materialize_model(
    name: &str,
    source: &str,
    checksum: Option<&str>,
    revision: Option<&str>,
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
        let path = confine(&path, state_dir)?;
        let verified = verify_checksum_if_requested(&path, checksum)?;
        return Ok((path, verified));
    }

    if let Some(local) = source.strip_prefix("file://") {
        let path = PathBuf::from(local);
        if !path.exists() {
            return Err(format!("local model path missing: {}", path.display()));
        }
        let path = confine(&path, state_dir)?;
        let verified = verify_checksum_if_requested(&path, checksum)?;
        return Ok((path, verified));
    }

    if source.starts_with('/') {
        let path = PathBuf::from(source);
        if !path.exists() {
            return Err(format!("local model path missing: {}", path.display()));
        }
        let path = confine(&path, state_dir)?;
        let verified = verify_checksum_if_requested(&path, checksum)?;
        return Ok((path, verified));
    }

    if let Some(repo) = source.strip_prefix("hf://") {
        let dest = state_dir.join("ai-models").join(sanitize_name(name));
        std::fs::create_dir_all(&dest).map_err(|e| format!("mkdir {}: {e}", dest.display()))?;
        download_hf(repo, &dest, revision)?;
        let dest = confine(&dest, state_dir)?;
        let verified = verify_checksum_if_requested(&dest, checksum)?;
        return Ok((dest, verified));
    }

    Err(format!(
        "unsupported model source '{source}' (use hf://, file://, absolute path, or FLUXVM_AI_MODEL_DIR)"
    ))
}

/// Canonicalize `path` and require it stay inside an allowed model root.
pub fn confine(path: &Path, state_dir: &Path) -> Result<PathBuf, String> {
    let canon = path
        .canonicalize()
        .map_err(|e| format!("canonicalize {}: {e}", path.display()))?;
    for root in allowed_roots(state_dir) {
        let Ok(root_canon) = root.canonicalize() else {
            continue;
        };
        if canon == root_canon || canon.starts_with(&root_canon) {
            return Ok(canon);
        }
    }
    Err(format!(
        "model path {} is outside FLUXVM_AI_MODEL_DIR and {{state}}/ai-models",
        canon.display()
    ))
}

fn allowed_roots(state_dir: &Path) -> Vec<PathBuf> {
    let mut roots = vec![state_dir.join("ai-models")];
    if let Ok(dir) = std::env::var("FLUXVM_AI_MODEL_DIR") {
        let dir = PathBuf::from(dir.trim());
        if !roots.iter().any(|r| r == &dir) {
            roots.push(dir);
        }
    }
    roots
}

pub(crate) fn sanitize_name(name: &str) -> String {
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

fn download_hf(repo: &str, dest: &Path, revision: Option<&str>) -> Result<(), String> {
    // Prefer huggingface-cli when present; otherwise leave a marker so the
    // reconciler can surface a clear "model not ready" message without
    // pulling multi-GB blobs during unit tests / GPU-less smoke tests.
    // An existing partial directory is left in place so the CLI can resume.
    let mut cmd = std::process::Command::new("huggingface-cli");
    cmd.args(["download", repo, "--local-dir", &dest.to_string_lossy()]);
    if let Some(rev) = revision.map(str::trim).filter(|s| !s.is_empty()) {
        cmd.args(["--revision", rev]);
    }
    let status = cmd
        .env("HF_TOKEN", std::env::var("HF_TOKEN").unwrap_or_default())
        .status();

    match status {
        Ok(s) if s.success() => Ok(()),
        Ok(s) => Err(format!("huggingface-cli download failed (exit {s})")),
        Err(e) => Err(format!(
            "huggingface-cli not available ({e}); set FLUXVM_AI_MODEL_DIR to a local model tree"
        )),
    }
}

/// Verify `expected` (sha256 hex) against a file, or against a sorted
/// directory manifest (`relative-path size sha256` per line, then hashed).
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

    let hex = if path.is_file() {
        sha256_file(path)?
    } else {
        directory_manifest_sha256(path)?
    };
    if hex != expected {
        return Err(format!(
            "checksum mismatch for {}: expected {expected}, got {hex}",
            path.display()
        ));
    }
    Ok(Some(hex))
}

fn directory_manifest_sha256(dir: &Path) -> Result<String, String> {
    let mut files = Vec::new();
    collect_files(dir, &mut files)?;
    files.sort();
    if files.is_empty() {
        return Err(format!(
            "no regular file under {} to verify checksum against",
            dir.display()
        ));
    }
    let mut lines = String::new();
    for file in files {
        let rel = file.strip_prefix(dir).unwrap_or(&file);
        let rel = rel.to_string_lossy().replace('\\', "/");
        let size = std::fs::metadata(&file)
            .map_err(|e| format!("stat {}: {e}", file.display()))?
            .len();
        let hex = sha256_file(&file)?;
        lines.push_str(&format!("{rel} {size} {hex}\n"));
    }
    let mut hasher = Sha256::new();
    hasher.update(lines.as_bytes());
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

fn collect_files(dir: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = std::fs::read_dir(dir).map_err(|e| format!("read {}: {e}", dir.display()))?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_files(&path, out)?;
        } else if path.is_file() {
            out.push(path);
        }
    }
    Ok(())
}

pub fn sha256_file(path: &Path) -> Result<String, String> {
    let data = std::fs::read(path).map_err(|e| format!("read {}: {e}", path.display()))?;
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
    use std::sync::Mutex;

    fn model_env_lock() -> &'static Mutex<()> {
        static LOCK: Mutex<()> = Mutex::new(());
        &LOCK
    }

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
        let _guard = model_env_lock().lock().unwrap();
        let dir = tempfile::tempdir().unwrap();
        std::env::set_var("FLUXVM_AI_MODEL_DIR", dir.path());
        let (path, _) = materialize_model(
            "mistral",
            "hf://mistralai/Mistral-7B-v0.1",
            None,
            None,
            Path::new("/tmp"),
        )
        .unwrap();
        std::env::remove_var("FLUXVM_AI_MODEL_DIR");
        assert_eq!(path, dir.path().canonicalize().unwrap());
    }

    #[test]
    fn rejects_path_outside_model_root() {
        let _guard = model_env_lock().lock().unwrap();
        std::env::remove_var("FLUXVM_AI_MODEL_DIR");
        let state = tempfile::tempdir().unwrap();
        let err =
            materialize_model("x", "file:///etc/passwd", None, None, state.path()).unwrap_err();
        assert!(err.contains("outside"), "{err}");
    }

    #[test]
    fn accepts_path_under_model_root() {
        let _guard = model_env_lock().lock().unwrap();
        std::env::remove_var("FLUXVM_AI_MODEL_DIR");
        let state = tempfile::tempdir().unwrap();
        let models = state.path().join("ai-models");
        std::fs::create_dir_all(&models).unwrap();
        let file = models.join("w.bin");
        std::fs::write(&file, b"abc").unwrap();
        let source = format!("file://{}", file.display());
        let (path, _) = materialize_model("x", &source, None, None, state.path()).unwrap();
        assert!(path.ends_with("w.bin"));
    }

    #[test]
    fn directory_checksum_is_sorted_manifest() {
        let dir = tempfile::tempdir().unwrap();
        std::fs::write(dir.path().join("b.bin"), b"b").unwrap();
        std::fs::write(dir.path().join("a.bin"), b"a").unwrap();
        let hex = super::directory_manifest_sha256(dir.path()).unwrap();
        let verified = verify_checksum_if_requested(dir.path(), Some(&hex))
            .unwrap()
            .unwrap();
        assert_eq!(verified, hex);
    }
}
