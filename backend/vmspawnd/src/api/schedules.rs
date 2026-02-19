use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use chrono::{DateTime, Utc, Timelike, Datelike, Duration};
use uuid::Uuid;

use crate::server::AppState;

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum VMAction {
    Start,
    Stop,
    Restart,
    Snapshot,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ScheduleType {
    Once,
    Daily,
    Weekly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub vm_name: String,
    pub action: VMAction,
    pub schedule_type: ScheduleType,
    pub time: String,                  // HH:MM format
    pub days_of_week: Option<Vec<u8>>, // 0-6, Sunday = 0
    pub enabled: bool,
    pub created: DateTime<Utc>,
    pub last_run: Option<DateTime<Utc>>,
    pub next_run: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateScheduleRequest {
    pub name: String,
    pub vm_name: String,
    pub action: VMAction,
    pub schedule_type: ScheduleType,
    pub time: String,
    pub days_of_week: Option<Vec<u8>>,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateScheduleRequest {
    pub name: Option<String>,
    pub vm_name: Option<String>,
    pub action: Option<VMAction>,
    pub schedule_type: Option<ScheduleType>,
    pub time: Option<String>,
    pub days_of_week: Option<Vec<u8>>,
    pub enabled: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExecutionStatus {
    Success,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleHistory {
    pub schedule_id: String,
    pub schedule_name: String,
    pub vm_name: String,
    pub action: String,
    pub executed_at: DateTime<Utc>,
    pub status: ExecutionStatus,
    pub error: Option<String>,
}

fn default_true() -> bool {
    true
}

// ============================================================================
// Helper Functions
// ============================================================================

fn calculate_next_run(
    schedule_type: &ScheduleType,
    time: &str,
    days_of_week: &Option<Vec<u8>>,
) -> Option<DateTime<Utc>> {
    let now = Utc::now();

    // Parse time (HH:MM)
    let parts: Vec<&str> = time.split(':').collect();
    if parts.len() != 2 {
        return None;
    }

    let hour: u32 = parts[0].parse().ok()?;
    let minute: u32 = parts[1].parse().ok()?;

    match schedule_type {
        ScheduleType::Once => {
            // Schedule for today at the specified time if not passed, otherwise tomorrow
            let mut next = now
                .with_hour(hour)?
                .with_minute(minute)?
                .with_second(0)?
                .with_nanosecond(0)?;

            if next <= now {
                next = next + Duration::days(1);
            }

            Some(next)
        }
        ScheduleType::Daily => {
            // Schedule for today at the specified time if not passed, otherwise tomorrow
            let mut next = now
                .with_hour(hour)?
                .with_minute(minute)?
                .with_second(0)?
                .with_nanosecond(0)?;

            if next <= now {
                next = next + Duration::days(1);
            }

            Some(next)
        }
        ScheduleType::Weekly => {
            // Find the next matching day of week
            let days = days_of_week.as_ref()?;
            if days.is_empty() {
                return None;
            }

            let current_weekday = now.weekday().num_days_from_sunday() as u8;
            let mut target_time = now
                .with_hour(hour)?
                .with_minute(minute)?
                .with_second(0)?
                .with_nanosecond(0)?;

            // Find next matching day
            for offset in 0..7 {
                let check_date = now + Duration::days(offset);
                let check_weekday = check_date.weekday().num_days_from_sunday() as u8;

                if days.contains(&check_weekday) {
                    target_time = check_date
                        .with_hour(hour)?
                        .with_minute(minute)?
                        .with_second(0)?
                        .with_nanosecond(0)?;

                    if target_time > now {
                        return Some(target_time);
                    }
                }
            }

            None
        }
    }
}

// ============================================================================
// Schedule Handlers
// ============================================================================

pub async fn list_schedules(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<Schedule>>, StatusCode> {
    // TODO: Load from state store
    // For now, return mock data
    let schedules = vec![
        Schedule {
            id: Uuid::new_v4().to_string(),
            name: "Nightly Shutdown".to_string(),
            vm_name: "web-server".to_string(),
            action: VMAction::Stop,
            schedule_type: ScheduleType::Daily,
            time: "22:00".to_string(),
            days_of_week: None,
            enabled: true,
            created: Utc::now(),
            last_run: Some(Utc::now() - Duration::days(1)),
            next_run: calculate_next_run(&ScheduleType::Daily, "22:00", &None),
        },
        Schedule {
            id: Uuid::new_v4().to_string(),
            name: "Weekday Startup".to_string(),
            vm_name: "web-server".to_string(),
            action: VMAction::Start,
            schedule_type: ScheduleType::Weekly,
            time: "08:00".to_string(),
            days_of_week: Some(vec![1, 2, 3, 4, 5]), // Monday-Friday
            enabled: true,
            created: Utc::now(),
            last_run: Some(Utc::now() - Duration::days(1)),
            next_run: calculate_next_run(
                &ScheduleType::Weekly,
                "08:00",
                &Some(vec![1, 2, 3, 4, 5]),
            ),
        },
    ];

    Ok(Json(schedules))
}

pub async fn get_schedule(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Schedule>, StatusCode> {
    // TODO: Load from state store
    let schedule = Schedule {
        id,
        name: "Nightly Shutdown".to_string(),
        vm_name: "web-server".to_string(),
        action: VMAction::Stop,
        schedule_type: ScheduleType::Daily,
        time: "22:00".to_string(),
        days_of_week: None,
        enabled: true,
        created: Utc::now(),
        last_run: Some(Utc::now() - Duration::days(1)),
        next_run: calculate_next_run(&ScheduleType::Daily, "22:00", &None),
    };

    Ok(Json(schedule))
}

pub async fn create_schedule(
    State(_state): State<Arc<AppState>>,
    Json(req): Json<CreateScheduleRequest>,
) -> Result<(StatusCode, Json<Schedule>), StatusCode> {
    // TODO: Validate time format
    // TODO: Validate days_of_week if schedule_type is Weekly
    // TODO: Save to state store

    let next_run = if req.enabled {
        calculate_next_run(&req.schedule_type, &req.time, &req.days_of_week)
    } else {
        None
    };

    let schedule = Schedule {
        id: Uuid::new_v4().to_string(),
        name: req.name,
        vm_name: req.vm_name,
        action: req.action,
        schedule_type: req.schedule_type,
        time: req.time,
        days_of_week: req.days_of_week,
        enabled: req.enabled,
        created: Utc::now(),
        last_run: None,
        next_run,
    };

    Ok((StatusCode::CREATED, Json(schedule)))
}

pub async fn update_schedule(
    State(_state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateScheduleRequest>,
) -> Result<Json<Schedule>, StatusCode> {
    // TODO: Load existing schedule from state store
    // TODO: Update fields
    // TODO: Recalculate next_run if time/schedule_type changed
    // TODO: Save to state store

    let schedule_type = req.schedule_type.unwrap_or(ScheduleType::Daily);
    let time = req.time.unwrap_or_else(|| "22:00".to_string());
    let days_of_week = req.days_of_week;
    let enabled = req.enabled.unwrap_or(true);

    let next_run = if enabled {
        calculate_next_run(&schedule_type, &time, &days_of_week)
    } else {
        None
    };

    let schedule = Schedule {
        id,
        name: req.name.unwrap_or_else(|| "Updated Schedule".to_string()),
        vm_name: req.vm_name.unwrap_or_else(|| "web-server".to_string()),
        action: req.action.unwrap_or(VMAction::Stop),
        schedule_type,
        time,
        days_of_week,
        enabled,
        created: Utc::now(),
        last_run: None,
        next_run,
    };

    Ok(Json(schedule))
}

pub async fn delete_schedule(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Remove from state store

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_schedule(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load schedule from state store
    // TODO: Set enabled = true
    // TODO: Calculate next_run
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

pub async fn disable_schedule(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load schedule from state store
    // TODO: Set enabled = false
    // TODO: Clear next_run
    // TODO: Save to state store

    Ok(StatusCode::OK)
}

pub async fn run_schedule_now(
    State(_state): State<Arc<AppState>>,
    Path(_id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // TODO: Load schedule from state store
    // TODO: Execute the scheduled action immediately
    // TODO: Update last_run
    // TODO: Add entry to history

    Ok(StatusCode::OK)
}

// ============================================================================
// History Handlers
// ============================================================================

pub async fn get_schedule_history(
    State(_state): State<Arc<AppState>>,
    Path(schedule_id): Path<String>,
) -> Result<Json<Vec<ScheduleHistory>>, StatusCode> {
    // TODO: Load history for specific schedule from state store
    let history = vec![
        ScheduleHistory {
            schedule_id: schedule_id.clone(),
            schedule_name: "Nightly Shutdown".to_string(),
            vm_name: "web-server".to_string(),
            action: "stop".to_string(),
            executed_at: Utc::now() - Duration::days(1),
            status: ExecutionStatus::Success,
            error: None,
        },
        ScheduleHistory {
            schedule_id,
            schedule_name: "Nightly Shutdown".to_string(),
            vm_name: "web-server".to_string(),
            action: "stop".to_string(),
            executed_at: Utc::now() - Duration::days(2),
            status: ExecutionStatus::Success,
            error: None,
        },
    ];

    Ok(Json(history))
}

pub async fn get_all_schedule_history(
    State(_state): State<Arc<AppState>>,
) -> Result<Json<Vec<ScheduleHistory>>, StatusCode> {
    // TODO: Load all history from state store (limit to last 100 entries)
    let history = vec![
        ScheduleHistory {
            schedule_id: Uuid::new_v4().to_string(),
            schedule_name: "Nightly Shutdown".to_string(),
            vm_name: "web-server".to_string(),
            action: "stop".to_string(),
            executed_at: Utc::now() - Duration::hours(2),
            status: ExecutionStatus::Success,
            error: None,
        },
        ScheduleHistory {
            schedule_id: Uuid::new_v4().to_string(),
            schedule_name: "Weekday Startup".to_string(),
            vm_name: "web-server".to_string(),
            action: "start".to_string(),
            executed_at: Utc::now() - Duration::hours(14),
            status: ExecutionStatus::Success,
            error: None,
        },
        ScheduleHistory {
            schedule_id: Uuid::new_v4().to_string(),
            schedule_name: "Daily Snapshot".to_string(),
            vm_name: "database".to_string(),
            action: "snapshot".to_string(),
            executed_at: Utc::now() - Duration::hours(26),
            status: ExecutionStatus::Failed,
            error: Some("Insufficient disk space".to_string()),
        },
    ];

    Ok(Json(history))
}
