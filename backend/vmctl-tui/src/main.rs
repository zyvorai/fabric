mod app;
mod events;
mod ui;
mod views;

use anyhow::Result;
use app::{App, View};
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{backend::CrosstermBackend, Terminal};
use std::io;

#[tokio::main]
async fn main() -> Result<()> {
    // Setup terminal
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen, EnableMouseCapture)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    // Create app and initial refresh
    let mut app = App::new();
    app.refresh().await?;

    let res = run_app(&mut terminal, &mut app).await;

    // Restore terminal
    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        LeaveAlternateScreen,
        DisableMouseCapture
    )?;
    terminal.show_cursor()?;

    if let Err(err) = res {
        println!("{:?}", err)
    }

    Ok(())
}

async fn run_app<B: ratatui::backend::Backend>(
    terminal: &mut Terminal<B>,
    app: &mut App,
) -> Result<()> {
    loop {
        terminal.draw(|f| ui::ui(f, app))?;

        if event::poll(std::time::Duration::from_millis(250))? {
            if let Event::Key(key) = event::read()? {
                if app.search_mode {
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
                        KeyCode::Char('q') => return Ok(()),
                        KeyCode::Char('Q') => return Ok(()),
                        KeyCode::Char('R') => app.refresh().await?,
                        KeyCode::Char('?') => app.switch_to_view(View::Help),
                        KeyCode::Char('/') => app.enter_search_mode(),
                        KeyCode::Esc => app.clear_search(),

                        // View navigation
                        KeyCode::Char('1') => app.switch_to_view(View::Dashboard),
                        KeyCode::Char('2') => app.switch_to_view(View::VMs),
                        KeyCode::Char('3') => app.switch_to_view(View::Logs),
                        KeyCode::Char('4') => app.switch_to_view(View::Metrics),
                        KeyCode::Char('5') => app.switch_to_view(View::Network),
                        KeyCode::Char('6') => app.switch_to_view(View::Storage),

                        KeyCode::Tab => app.next_view(),
                        KeyCode::BackTab => app.previous_view(),

                        // List navigation
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

                        // VM actions (single)
                        KeyCode::Char('s') if !app.bulk_mode => app.start_selected().await?,
                        KeyCode::Char('t') if !app.bulk_mode => app.stop_selected().await?,
                        KeyCode::Char('r') if !app.bulk_mode => app.restart_selected().await?,
                        KeyCode::Char('d') if !app.bulk_mode => app.delete_selected().await?,

                        KeyCode::Enter => {
                            // Could open details view
                        }

                        _ => {}
                    }
                }
            }
        } else {
            // Auto-refresh every 5 seconds
            app.refresh().await?;
        }
    }
}
