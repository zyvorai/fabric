// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

mod app;
mod events;
mod ui;
mod views;

use anyhow::Result;
use app::{App, CommandEffect, View};
use crossterm::{
    event::{self, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize tracing to file (can't log to stdout in TUI mode)
    // Logs go to /tmp/vmctl-tui.log when VSPAWN_LOG_LEVEL=debug
    let env_filter = if let Ok(level) = std::env::var("VSPAWN_LOG_LEVEL") {
        tracing_subscriber::EnvFilter::new(format!("vmctl_tui={level}"))
    } else {
        tracing_subscriber::EnvFilter::try_from_default_env()
            .unwrap_or_else(|_| "vmctl_tui=warn".into())
    };

    let log_file = tracing_appender::rolling::never("/tmp", "vmctl-tui.log");
    let (non_blocking, _guard) = tracing_appender::non_blocking(log_file);

    tracing_subscriber::registry()
        .with(env_filter)
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(non_blocking)
                .with_ansi(false),
        )
        .init();

    tracing::debug!("vmctl-tui starting");

    // Setup terminal (no mouse capture - cleaner terminal interaction)
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(
        stdout,
        EnterAlternateScreen,
        crossterm::event::EnableMouseCapture
    )?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app and initial refresh
    let mut app = App::new();
    tracing::debug!("Initial data refresh");
    app.refresh().await?;

    let res = run_app(&mut terminal, &mut app).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        crossterm::event::DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("{:?}", err)
    }

    tracing::debug!("vmctl-tui shutdown complete");
    Ok(())
}

async fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    app: &mut App,
) -> Result<()> {
    let mut last_refresh = std::time::Instant::now();
    let refresh_interval = std::time::Duration::from_secs(5);

    loop {
        // Clear expired status messages
        app.clear_expired_status();
        app.clear_expired_toast();

        terminal.draw(|f| ui::ui(f, app))?;

        // Check for Ctrl+C signal alongside keyboard events
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                tracing::debug!("Received Ctrl+C, exiting");
                return Ok(());
            }
            poll_result = tokio::task::spawn_blocking(|| {
                event::poll(std::time::Duration::from_millis(250))
            }) => {
                if poll_result?? {
                    if let Event::Key(key) = event::read()? {
                        // Handle pending confirmation first
                        if app.pending_action.is_some() {
                            match key.code {
                                KeyCode::Char('y') | KeyCode::Char('Y') => {
                                    app.confirm_pending_action().await?;
                                }
                                KeyCode::Char('n') | KeyCode::Char('N') | KeyCode::Esc => {
                                    app.cancel_pending_action();
                                }
                                _ => {}
                            }
                            continue;
                        }

                        if app.command_mode {
                            match key.code {
                                KeyCode::Esc => app.exit_command_mode(),
                                KeyCode::Enter => {
                                    match app.run_command() {
                                        CommandEffect::StartSelected => {
                                            app.start_selected().await?;
                                        }
                                        CommandEffect::StopSelected => {
                                            app.stop_selected().await?;
                                        }
                                        CommandEffect::SnapSelected => {
                                            app.snap_selected().await?;
                                        }
                                        CommandEffect::Refresh => {
                                            app.refresh().await?;
                                        }
                                        CommandEffect::None => {}
                                    }
                                }
                                KeyCode::Backspace => {
                                    app.command_buffer.pop();
                                }
                                KeyCode::Char(c) => app.command_buffer.push(c),
                                _ => {}
                            }
                        } else if app.search_mode {
                            // Handle search mode input
                            match key.code {
                                KeyCode::Esc => app.clear_search(),
                                KeyCode::Enter => app.search_mode = false,
                                KeyCode::Backspace => app.delete_search_char(),
                                KeyCode::Char(c) => app.add_search_char(c),
                                _ => {}
                            }
                        } else {
                            // Normal mode input
                            match key.code {
                                // Global shortcuts
                                KeyCode::Char('q') => {
                                    tracing::debug!("User pressed q, exiting");
                                    return Ok(());
                                }
                                KeyCode::Char('Q') => {
                                    tracing::debug!("User pressed Q, exiting");
                                    return Ok(());
                                }
                                KeyCode::Char('R') => {
                                    tracing::debug!("Manual refresh triggered");
                                    app.refresh().await?;
                                }
                                KeyCode::Char('?') => app.switch_to_view(View::Help),
                                KeyCode::Char('/') => app.enter_search_mode(),
                                KeyCode::Char(':') => app.enter_command_mode(),
                                KeyCode::Esc => {
                                    if app.current_view == View::VMDetail {
                                        app.switch_to_view(View::VMs);
                                    } else {
                                        app.clear_search();
                                    }
                                }

                                // View navigation
                                KeyCode::Char('1') => app.switch_to_view(View::Dashboard),
                                KeyCode::Char('2') => app.switch_to_view(View::VMs),
                                KeyCode::Char('3') => app.switch_to_view(View::Logs),
                                KeyCode::Char('4') => app.switch_to_view(View::Metrics),
                                KeyCode::Char('5') => app.switch_to_view(View::Network),
                                KeyCode::Char('6') => app.switch_to_view(View::NetSecurity),
                                KeyCode::Char('7') => app.switch_to_view(View::Storage),

                                KeyCode::Tab => app.next_view(),
                                KeyCode::BackTab => app.previous_view(),

                                // List navigation
                                KeyCode::Down | KeyCode::Char('j') if app.current_view == View::NetSecurity => app.netsec_next_item(),
                                KeyCode::Up | KeyCode::Char('k') if app.current_view == View::NetSecurity => app.netsec_prev_item(),
                                KeyCode::Down | KeyCode::Char('j') => app.next(),
                                KeyCode::Up | KeyCode::Char('k') => app.previous(),
                                KeyCode::PageDown => {
                                    for _ in 0..10 {
                                        app.next();
                                    }
                                }
                                KeyCode::PageUp => {
                                    for _ in 0..10 {
                                        app.previous();
                                    }
                                }
                                KeyCode::Home => app.selected = 0,
                                KeyCode::End => {
                                    let filtered = app.filtered_vms();
                                    if !filtered.is_empty() {
                                        app.selected = filtered.len() - 1;
                                    }
                                }

                                // Bulk operations
                                KeyCode::Char('v') => app.toggle_bulk_mode(),
                                KeyCode::Char(' ') if app.bulk_mode => app.toggle_vm_selection(),
                                KeyCode::Char('a') if app.bulk_mode => app.select_all(),
                                KeyCode::Char('A') if app.bulk_mode => app.deselect_all(),
                                KeyCode::Char('S') if app.bulk_mode && !app.selected_vms.is_empty() => {
                                    app.bulk_start().await?
                                }
                                KeyCode::Char('T') if app.bulk_mode && !app.selected_vms.is_empty() => {
                                    app.bulk_stop().await?
                                }
                                KeyCode::Char('D') if app.bulk_mode && !app.selected_vms.is_empty() => {
                                    app.bulk_delete().await?
                                }

                                // NetSecurity-specific actions
                                KeyCode::Right if app.current_view == View::NetSecurity => app.netsec_next_tab(),
                                KeyCode::Left if app.current_view == View::NetSecurity => app.netsec_prev_tab(),
                                KeyCode::Char('l') if app.current_view == View::NetSecurity => app.netsec_next_tab(),
                                KeyCode::Char('h') if app.current_view == View::NetSecurity => app.netsec_prev_tab(),
                                KeyCode::Char('S') if app.current_view == View::NetSecurity => app.netsec_sync().await,
                                KeyCode::Char('d') if app.current_view == View::NetSecurity => app.netsec_delete_selected().await,

                                // VM actions (single)
                                KeyCode::Char('s') if !app.bulk_mode => app.start_selected().await?,
                                KeyCode::Char('t') if !app.bulk_mode => app.stop_selected().await?,
                                KeyCode::Char('r') if !app.bulk_mode => app.restart_selected().await?,
                                KeyCode::Char('b') if !app.bulk_mode => app.backup_selected().await?,
                                KeyCode::Char('d') if !app.bulk_mode => app.delete_selected().await?,
                                KeyCode::Char('m') if !app.bulk_mode => app.switch_to_view(View::Metrics),

                                // Enter opens detail view
                                KeyCode::Enter => app.open_selected_detail(),

                                _ => {}
                            }
                        }
                    }
                }
            }
        }

        // Auto-refresh every 5 seconds
        if last_refresh.elapsed() >= refresh_interval {
            tracing::debug!("Auto-refresh triggered");
            if let Err(e) = app.refresh().await {
                tracing::warn!("Refresh failed: {}", e);
                app.add_status(format!("Refresh failed: {}", e), app::StatusLevel::Error);
            }
            last_refresh = std::time::Instant::now();
        }
    }
}
