// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum OperatorError {
    #[error("kubernetes API: {0}")]
    Kube(#[from] kube::Error),
    #[error("fabric API: {0}")]
    Http(#[from] reqwest::Error),
    #[error("{0}")]
    Other(String),
}
