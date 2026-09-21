// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Background, content-addressed model materialization.
//!
//! HTTP handlers only record a job. This loop downloads, resumes a partial
//! tree, and lets a second job for the same digest join the first.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::Utc;
use security::{RequireRead, RequireWrite};
use std::path::{Path as FsPath, PathBuf};
use std::sync::Arc;

use crate::server::AppState;

use super::model_cache::{self, sha256_file};
use super::types::{ModelArtifact, ModelJob, ModelJobState};
use super::{audit, err, STORE_MODELS, STORE_MODEL_JOBS};

pub fn source_is_local(source: &str) -> bool {
    std::env::var("FLUXVM_AI_MODEL_DIR").is_ok()
        || source.starts_with("file://")
        || source.starts_with('/')
}

/// Bytes already on disk. A later download continues from this offset.
pub fn resume_offset(path: &FsPath) -> u64 {
    if path.is_file() {
        return std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    }
    if path.is_dir() {
        return dir_bytes(path);
    }
    0
}

fn dir_bytes(path: &FsPath) -> u64 {
    let mut total = 0u64;
    let Ok(entries) = std::fs::read_dir(path) else {
        return 0;
    };
    for entry in entries.flatten() {
        let p = entry.path();
        if p.is_dir() {
            total = total.saturating_add(dir_bytes(&p));
        } else if let Ok(meta) = std::fs::metadata(&p) {
            total = total.saturating_add(meta.len());
        }
    }
    total
}

/// Refuse the job when free space is below the declared object size.
pub fn admit_disk(free: u64, declared: Option<u64>) -> Result<(), String> {
    if let Some(need) = declared {
        if free < need {
            return Err(format!("free disk {free} is below declared size {need}"));
        }
    }
    Ok(())
}

/// Another in-flight or ready job for the same digest or source+revision.
pub fn find_join<'a>(jobs: &'a [ModelJob], job: &ModelJob) -> Option<&'a ModelJob> {
    let digest = job.digest.as_deref().or(job.checksum.as_deref());
    if let Some(digest) = digest {
        if let Some(other) = jobs.iter().find(|other| {
            other.id != job.id
                && other.digest.as_deref().or(other.checksum.as_deref()) == Some(digest)
                && matches!(
                    other.state,
                    ModelJobState::Downloading | ModelJobState::Verifying | ModelJobState::Ready
                )
        }) {
            return Some(other);
        }
    }
    jobs.iter().find(|other| {
        other.id != job.id
            && other.source == job.source
            && other.revision == job.revision
            && other.created_at <= job.created_at
            && matches!(
                other.state,
                ModelJobState::Resolving
                    | ModelJobState::Downloading
                    | ModelJobState::Verifying
                    | ModelJobState::Ready
            )
    })
}

pub fn register(state: &AppState, model: &ModelArtifact) -> Result<ModelJob, String> {
    let existing: Vec<ModelJob> = state
        .store
        .list_entities(STORE_MODEL_JOBS)
        .unwrap_or_default();
    let mut job = ModelJob {
        id: format!("{}--{}", model.name, uuid::Uuid::new_v4().simple()),
        model: model.name.clone(),
        source: model.source.clone(),
        revision: model.revision.clone(),
        checksum: model.checksum.clone(),
        state: ModelJobState::Registered,
        digest: model.checksum.clone(),
        message: None,
        retries: 0,
        bytes_written: 0,
        joined_job: None,
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    if let Some(other) = find_join(&existing, &job) {
        job.joined_job = Some(other.id.clone());
        job.digest = other.digest.clone().or(job.digest);
        job.state = if other.state == ModelJobState::Ready {
            ModelJobState::Ready
        } else {
            ModelJobState::Resolving
        };
        job.message = Some(format!("joined {}", other.id));
        if other.state == ModelJobState::Ready {
            copy_ready_model(state, &job.model, other)?;
        }
    }
    state
        .store
        .save_entity(STORE_MODEL_JOBS, &job.id, &job)
        .map_err(|e| e.to_string())?;
    Ok(job)
}

fn copy_ready_model(state: &AppState, model_name: &str, other: &ModelJob) -> Result<(), String> {
    let Some(mut model) = state
        .store
        .get_entity::<ModelArtifact>(STORE_MODELS, model_name)
        .map_err(|e| e.to_string())?
    else {
        return Ok(());
    };
    if let Some(source) = state
        .store
        .get_entity::<ModelArtifact>(STORE_MODELS, &other.model)
        .ok()
        .flatten()
    {
        model.local_path = source.local_path;
        model.checksum = model.checksum.or(source.checksum).or(other.digest.clone());
        model.updated = Utc::now();
        state
            .store
            .save_entity(STORE_MODELS, &model.name, &model)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Advance one job a single state. Safe to call again after a restart.
pub fn drive_job(state: &AppState, id: &str) {
    let Ok(Some(mut job)) = state.store.get_entity::<ModelJob>(STORE_MODEL_JOBS, id) else {
        return;
    };
    if matches!(job.state, ModelJobState::Ready | ModelJobState::Failed) {
        return;
    }
    let result = step(state, &mut job);
    if let Err(msg) = result {
        job.retries = job.retries.saturating_add(1);
        job.message = Some(msg);
        job.state = if job.retries < 3 {
            ModelJobState::Registered
        } else {
            ModelJobState::Failed
        };
    }
    job.updated_at = Utc::now();
    let _ = state.store.save_entity(STORE_MODEL_JOBS, &job.id, &job);
}

fn step(state: &AppState, job: &mut ModelJob) -> Result<(), String> {
    match job.state {
        ModelJobState::Registered | ModelJobState::Resolving => {
            job.state = ModelJobState::Resolving;
            let jobs: Vec<ModelJob> = state
                .store
                .list_entities(STORE_MODEL_JOBS)
                .unwrap_or_default();
            if let Some(other) = find_join(&jobs, job) {
                job.joined_job = Some(other.id.clone());
                job.digest = other.digest.clone().or(job.digest.clone());
                job.message = Some(format!("joined {}", other.id));
                if other.state == ModelJobState::Ready {
                    copy_ready_model(state, &job.model, other)?;
                    job.state = ModelJobState::Ready;
                }
                return Ok(());
            }
            let state_dir = PathBuf::from(&state.config.storage.path);
            let declared = state
                .store
                .get_entity::<ModelArtifact>(STORE_MODELS, &job.model)
                .ok()
                .flatten()
                .and_then(|m| m.size_bytes);
            let free = free_bytes(&state_dir)?;
            admit_disk(free, declared)?;
            job.state = ModelJobState::Downloading;
            Ok(())
        }
        ModelJobState::Downloading => {
            let state_dir = PathBuf::from(&state.config.storage.path);
            let dest_name = job
                .digest
                .clone()
                .filter(|d| !d.is_empty())
                .unwrap_or_else(|| format!("partial-{}", job.id));
            let partial = state_dir
                .join("ai-models")
                .join(model_cache::sanitize_name(&dest_name));
            job.bytes_written = resume_offset(&partial);
            let (path, verified) = model_cache::materialize_model(
                &dest_name,
                &job.source,
                job.checksum.as_deref(),
                job.revision.as_deref(),
                &state_dir,
            )?;
            job.bytes_written = resume_offset(&path);
            if let Some(hex) = verified.or_else(|| {
                if path.is_file() {
                    sha256_file(&path).ok()
                } else {
                    None
                }
            }) {
                job.digest = Some(hex);
            }
            job.state = ModelJobState::Verifying;
            job.message = Some(path.to_string_lossy().into_owned());
            Ok(())
        }
        ModelJobState::Verifying => {
            let path = job
                .message
                .clone()
                .ok_or_else(|| "model job has no downloaded path".to_string())?;
            let verified = model_cache::verify_checksum_if_requested(
                FsPath::new(&path),
                job.checksum.as_deref(),
            )?;
            if let Some(hex) = verified.or(job.digest.clone()) {
                job.digest = Some(hex);
            }
            if let Some(mut model) = state
                .store
                .get_entity::<ModelArtifact>(STORE_MODELS, &job.model)
                .map_err(|e| e.to_string())?
            {
                model.local_path = Some(path);
                model.checksum = job.digest.clone().or(model.checksum);
                model.updated = Utc::now();
                state
                    .store
                    .save_entity(STORE_MODELS, &model.name, &model)
                    .map_err(|e| e.to_string())?;
            }
            job.state = ModelJobState::Ready;
            job.message = Some("ready".into());
            Ok(())
        }
        ModelJobState::Ready | ModelJobState::Failed => Ok(()),
    }
}

fn free_bytes(path: &FsPath) -> Result<u64, String> {
    let dir = if path.is_dir() {
        path.to_path_buf()
    } else {
        path.parent().unwrap_or(path).to_path_buf()
    };
    if !dir.exists() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    let c = std::ffi::CString::new(dir.to_string_lossy().as_bytes().to_vec())
        .map_err(|_| "model dir path contains a nul".to_string())?;
    let mut stat: libc::statvfs = unsafe { std::mem::zeroed() };
    let rc = unsafe { libc::statvfs(c.as_ptr(), &mut stat) };
    if rc != 0 {
        return Err(format!(
            "statvfs {}: {}",
            dir.display(),
            std::io::Error::last_os_error()
        ));
    }
    Ok((stat.f_bavail as u64).saturating_mul(stat.f_frsize as u64))
}

pub async fn run_model_job_controller(state: Arc<AppState>) {
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
    loop {
        interval.tick().await;
        let jobs: Vec<ModelJob> = state
            .store
            .list_entities(STORE_MODEL_JOBS)
            .unwrap_or_default();
        for job in jobs {
            if matches!(job.state, ModelJobState::Ready | ModelJobState::Failed) {
                continue;
            }
            let state = state.clone();
            let id = job.id.clone();
            let _ = tokio::task::spawn_blocking(move || drive_job(&state, &id)).await;
        }
    }
}

/// Drive a local or stub source to a terminal state before the handler returns.
pub fn drive_until_terminal(state: &AppState, id: &str) -> Option<ModelJob> {
    for _ in 0..6 {
        drive_job(state, id);
        if let Ok(Some(job)) = state.store.get_entity::<ModelJob>(STORE_MODEL_JOBS, id) {
            if matches!(job.state, ModelJobState::Ready | ModelJobState::Failed) {
                return Some(job);
            }
        }
    }
    state.store.get_entity(STORE_MODEL_JOBS, id).ok().flatten()
}

/// POST /api/ai/models/{name}/materialize
pub async fn materialize(
    RequireWrite(_claims): RequireWrite,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<(StatusCode, Json<ModelJob>), (StatusCode, Json<serde_json::Value>)> {
    let model = state
        .store
        .get_entity::<ModelArtifact>(STORE_MODELS, &name)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "ModelArtifact not found"))?;
    let job = register(&state, &model).map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    audit(
        &state,
        "model-job",
        "CREATE",
        &format!("ai/model-jobs/{}", job.id),
        "SUCCESS",
    );
    Ok((StatusCode::ACCEPTED, Json(job)))
}

/// GET /api/ai/model-jobs
pub async fn list_jobs(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ModelJob>>, (StatusCode, Json<serde_json::Value>)> {
    let mut jobs: Vec<ModelJob> = state
        .store
        .list_entities(STORE_MODEL_JOBS)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    jobs.sort_by_key(|job| job.created_at);
    Ok(Json(jobs))
}

/// GET /api/ai/models/{name}/status
pub async fn model_status(
    RequireRead(_claims): RequireRead,
    State(state): State<Arc<AppState>>,
    Path(name): Path<String>,
) -> Result<Json<ModelJob>, (StatusCode, Json<serde_json::Value>)> {
    let mut jobs: Vec<ModelJob> = state
        .store
        .list_entities(STORE_MODEL_JOBS)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    jobs.retain(|j| j.model == name);
    jobs.sort_by_key(|job| job.created_at);
    jobs.pop()
        .ok_or_else(|| err(StatusCode::NOT_FOUND, "no model job for this artifact"))
        .map(Json)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn job(id: &str, digest: Option<&str>, state: ModelJobState) -> ModelJob {
        ModelJob {
            id: id.into(),
            model: "m".into(),
            source: "hf://org/model".into(),
            revision: Some("main".into()),
            checksum: digest.map(str::to_string),
            state,
            digest: digest.map(str::to_string),
            message: None,
            retries: 0,
            bytes_written: 0,
            joined_job: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        }
    }

    #[test]
    fn disk_admission_refuses_a_short_volume() {
        assert!(admit_disk(10, Some(11)).is_err());
        assert!(admit_disk(11, Some(11)).is_ok());
        assert!(admit_disk(0, None).is_ok());
    }

    #[test]
    fn second_job_joins_the_same_digest() {
        let first = job("a", Some("abc"), ModelJobState::Downloading);
        let second = job("b", Some("abc"), ModelJobState::Registered);
        let jobs = [first];
        let joined = find_join(&jobs, &second).unwrap();
        assert_eq!(joined.id, "a");
    }

    #[test]
    fn resume_offset_is_the_partial_file_length() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join("partial.bin");
        std::fs::write(&file, b"abcdef").unwrap();
        assert_eq!(resume_offset(&file), 6);
        assert_eq!(resume_offset(&dir.path().join("missing")), 0);
    }
}
