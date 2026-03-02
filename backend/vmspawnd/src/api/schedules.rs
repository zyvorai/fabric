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
    #[serde(default = "crate::validation::default_true")]
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

// ============================================================================
// Validation Functions
// ============================================================================

fn validate_schedule(req: &CreateScheduleRequest) -> Result<(), String> {
    // Validate time format (HH:MM)
    let parts: Vec<&str> = req.time.split(':').collect();
    if parts.len() != 2 {
        return Err("Time must be in HH:MM format".to_string());
    }

    let hour: Result<u32, _> = parts[0].parse();
    let minute: Result<u32, _> = parts[1].parse();

    match (hour, minute) {
        (Ok(h), Ok(m)) => {
            if h >= 24 {
                return Err("Hour must be between 0 and 23".to_string());
            }
            if m >= 60 {
                return Err("Minute must be between 0 and 59".to_string());
            }
        }
        _ => {
            return Err("Invalid time format".to_string());
        }
    }

    // Validate days_of_week for weekly schedules
    if matches!(req.schedule_type, ScheduleType::Weekly) {
        if let Some(days) = &req.days_of_week {
            if days.is_empty() {
                return Err("Weekly schedules must specify at least one day".to_string());
            }
            for day in days {
                if *day > 6 {
                    return Err("Day of week must be between 0 (Sunday) and 6 (Saturday)".to_string());
                }
            }
        } else {
            return Err("Weekly schedules require days_of_week".to_string());
        }
    }

    // Validate VM name is not empty
    if req.vm_name.trim().is_empty() {
        return Err("VM name cannot be empty".to_string());
    }

    // Validate schedule name is not empty
    if req.name.trim().is_empty() {
        return Err("Schedule name cannot be empty".to_string());
    }

    Ok(())
}

// ============================================================================
// Helper Functions
// ============================================================================

/// Public wrapper for background scheduler use
pub fn calculate_next_run_pub(
    schedule_type: &ScheduleType,
    time: &str,
    days_of_week: &Option<Vec<u8>>,
) -> Option<DateTime<Utc>> {
    calculate_next_run(schedule_type, time, days_of_week)
}

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
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<Schedule>>, StatusCode> {
    // Load from state store, fall back to mock data if empty
    let schedules = state.store.list_entities::<Schedule>("schedules")
        .unwrap_or_else(|_| vec![
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
    ]);

    Ok(Json(schedules))
}

pub async fn get_schedule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<Json<Schedule>, StatusCode> {
    // Load from state store
    let schedule = state.store.get_entity::<Schedule>("schedules", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(schedule))
}

pub async fn create_schedule(
    State(state): State<Arc<AppState>>,
    Json(req): Json<CreateScheduleRequest>,
) -> Result<(StatusCode, Json<Schedule>), StatusCode> {
    // Validate schedule
    if let Err(err) = validate_schedule(&req) {
        tracing::warn!("Invalid schedule: {}", err);
        return Err(StatusCode::BAD_REQUEST);
    }

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

    // Save to state store
    if let Err(e) = state.store.save_entity("schedules", &schedule.id, &schedule) {
        tracing::error!("Failed to save schedule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok((StatusCode::CREATED, Json(schedule)))
}

pub async fn update_schedule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
    Json(req): Json<UpdateScheduleRequest>,
) -> Result<Json<Schedule>, StatusCode> {
    // Load existing schedule from state store
    let mut schedule = state.store.get_entity::<Schedule>("schedules", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let mut recalculate_next_run = false;

    // Update fields if provided
    if let Some(name) = req.name {
        if name.trim().is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }
        schedule.name = name;
    }
    if let Some(vm_name) = req.vm_name {
        if vm_name.trim().is_empty() {
            return Err(StatusCode::BAD_REQUEST);
        }
        schedule.vm_name = vm_name;
    }
    if let Some(action) = req.action {
        schedule.action = action;
    }
    if let Some(schedule_type) = req.schedule_type {
        schedule.schedule_type = schedule_type;
        recalculate_next_run = true;
    }
    if let Some(time) = req.time {
        // Validate time format
        let parts: Vec<&str> = time.split(':').collect();
        if parts.len() != 2 {
            return Err(StatusCode::BAD_REQUEST);
        }
        schedule.time = time;
        recalculate_next_run = true;
    }
    if let Some(days_of_week) = req.days_of_week {
        schedule.days_of_week = Some(days_of_week);
        recalculate_next_run = true;
    }
    if let Some(enabled) = req.enabled {
        schedule.enabled = enabled;
        recalculate_next_run = true;
    }

    // Recalculate next_run if time/schedule_type changed
    if recalculate_next_run {
        schedule.next_run = if schedule.enabled {
            calculate_next_run(&schedule.schedule_type, &schedule.time, &schedule.days_of_week)
        } else {
            None
        };
    }

    // Save to state store
    if let Err(e) = state.store.save_entity("schedules", &schedule.id, &schedule) {
        tracing::error!("Failed to update schedule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(Json(schedule))
}

pub async fn delete_schedule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Remove from state store
    if let Err(e) = state.store.delete_entity("schedules", &id) {
        tracing::error!("Failed to delete schedule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn enable_schedule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Load schedule from state store
    let mut schedule = state.store.get_entity::<Schedule>("schedules", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Set enabled = true
    schedule.enabled = true;

    // Calculate next_run
    schedule.next_run = calculate_next_run(&schedule.schedule_type, &schedule.time, &schedule.days_of_week);

    // Save to state store
    if let Err(e) = state.store.save_entity("schedules", &schedule.id, &schedule) {
        tracing::error!("Failed to enable schedule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::OK)
}

pub async fn disable_schedule(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Load schedule from state store
    let mut schedule = state.store.get_entity::<Schedule>("schedules", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Set enabled = false
    schedule.enabled = false;

    // Clear next_run
    schedule.next_run = None;

    // Save to state store
    if let Err(e) = state.store.save_entity("schedules", &schedule.id, &schedule) {
        tracing::error!("Failed to disable schedule: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(StatusCode::OK)
}

pub async fn run_schedule_now(
    State(state): State<Arc<AppState>>,
    Path(id): Path<String>,
) -> Result<StatusCode, StatusCode> {
    // Load schedule from state store
    let mut schedule = state.store.get_entity::<Schedule>("schedules", &id)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    // Execute the scheduled action immediately (call VM API)
    tracing::info!("Executing schedule {} immediately: {:?} on VM {}",
                   schedule.name, schedule.action, schedule.vm_name);

    // Execute the VM action
    let result = match schedule.action {
        VMAction::Start => vmspawn_driver::start_vm(&schedule.vm_name),
        VMAction::Stop => vmspawn_driver::stop_vm(&schedule.vm_name),
        VMAction::Restart => vmspawn_driver::restart_vm(&schedule.vm_name),
        VMAction::Snapshot => {
            tracing::warn!("Snapshot action not yet implemented");
            Ok(())
        }
    };

    // Check if execution was successful
    let (success, error) = match result {
        Ok(_) => (true, None),
        Err(e) => (false, Some(e.to_string())),
    };

    if !success {
        tracing::error!("Failed to execute schedule {}: {:?}", schedule.name, error);
    }

    let executed_at = Utc::now();

    // Update last_run
    schedule.last_run = Some(executed_at);

    // Save to state store
    if let Err(e) = state.store.save_entity("schedules", &schedule.id, &schedule) {
        tracing::error!("Failed to update schedule last_run: {}", e);
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    // Add entry to history
    let action_str = match schedule.action {
        VMAction::Start => "start",
        VMAction::Stop => "stop",
        VMAction::Restart => "restart",
        VMAction::Snapshot => "snapshot",
    };

    let history_entry = ScheduleHistory {
        schedule_id: schedule.id.clone(),
        schedule_name: schedule.name.clone(),
        vm_name: schedule.vm_name.clone(),
        action: action_str.to_string(),
        executed_at,
        status: if success { ExecutionStatus::Success } else { ExecutionStatus::Failed },
        error: error.clone(),
    };

    let history_id = Uuid::new_v4().to_string();
    if let Err(e) = state.store.save_entity("schedule_history", &history_id, &history_entry) {
        tracing::error!("Failed to save schedule history: {}", e);
        // Don't fail the request if history fails
    }

    Ok(StatusCode::OK)
}

// ============================================================================
// History Handlers
// ============================================================================

pub async fn get_schedule_history(
    State(state): State<Arc<AppState>>,
    Path(schedule_id): Path<String>,
) -> Result<Json<Vec<ScheduleHistory>>, StatusCode> {
    // Load history for specific schedule from state store
    let all_history = state.store.list_entities::<ScheduleHistory>("schedule_history")
        .unwrap_or_default();

    // Filter by schedule_id and sort by execution time (most recent first)
    let mut history: Vec<ScheduleHistory> = all_history
        .into_iter()
        .filter(|h| h.schedule_id == schedule_id)
        .collect();

    history.sort_by(|a, b| b.executed_at.cmp(&a.executed_at));

    // Limit to last 100 entries
    history.truncate(100);

    Ok(Json(history))
}

pub async fn get_all_schedule_history(
    State(state): State<Arc<AppState>>,
) -> Result<Json<Vec<ScheduleHistory>>, StatusCode> {
    // Load all history from state store
    let mut history = state.store.list_entities::<ScheduleHistory>("schedule_history")
        .unwrap_or_default();

    // Sort by execution time (most recent first)
    history.sort_by(|a, b| b.executed_at.cmp(&a.executed_at));

    // Limit to last 100 entries
    history.truncate(100);

    Ok(Json(history))
}
