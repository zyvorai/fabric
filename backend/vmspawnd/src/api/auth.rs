use axum::{
    extract::State,
    http::StatusCode,
    response::IntoResponse,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;

use crate::server::AppState;

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub token: String,
    pub user_id: String,
    pub role: String,
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub id: String,
    pub username: String,
    pub role: String,
}

pub async fn login(
    State(state): State<Arc<AppState>>,
    Json(req): Json<LoginRequest>,
) -> Result<impl IntoResponse, StatusCode> {
    let user_db = state.user_db.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    let jwt_config = state.jwt_config.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let user = user_db
        .get_by_username(&req.username)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let valid = user
        .verify_password(&req.password)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token = jwt_config
        .generate_token(&user.id, user.role.clone())
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let role_str = serde_json::to_value(&user.role)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .as_str()
        .unwrap_or("viewer")
        .to_string();

    Ok(Json(LoginResponse {
        token,
        user_id: user.id,
        role: role_str,
        username: user.username,
    }))
}

pub async fn me(
    State(state): State<Arc<AppState>>,
    req: axum::extract::Request,
) -> Result<impl IntoResponse, StatusCode> {
    let claims = req
        .extensions()
        .get::<security::Claims>()
        .ok_or(StatusCode::UNAUTHORIZED)?
        .clone();

    let user_db = state.user_db.as_ref().ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;

    let user = user_db
        .get_by_id(&claims.sub)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let role_str = serde_json::to_value(&user.role)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .as_str()
        .unwrap_or("viewer")
        .to_string();

    Ok(Json(MeResponse {
        id: user.id,
        username: user.username,
        role: role_str,
    }))
}
