use crate::app::App;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph},
    Frame,
};

pub fn ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(0),
            Constraint::Length(3),
        ])
        .split(f.area());

    render_header(f, chunks[0]);
    render_vm_list(f, app, chunks[1]);
    render_footer(f, chunks[2]);
}

fn render_header(f: &mut Frame, area: Rect) {
    let header = Paragraph::new("vmspawnd TUI")
        .style(Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(header, area);
}

fn render_vm_list(f: &mut Frame, app: &App, area: Rect) {
    let items: Vec<ListItem> = app
        .vms
        .iter()
        .enumerate()
        .map(|(i, vm)| {
            let state_color = match vm.state {
                vm_model::VMState::Running => Color::Green,
                vm_model::VMState::Stopped => Color::Red,
                vm_model::VMState::Paused => Color::Yellow,
                vm_model::VMState::Unknown => Color::Gray,
            };

            let content = vec![Line::from(vec![
                Span::styled(
                    format!("{:<20}", vm.name),
                    if i == app.selected {
                        Style::default()
                            .fg(Color::Yellow)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                ),
                Span::styled(format!("{:<10}", format!("{:?}", vm.state)), Style::default().fg(state_color)),
                Span::raw(format!("{:<8}", format!("{}C", vm.cpus))),
                Span::raw(format!("{}MB", vm.memory)),
            ])];

            ListItem::new(content)
        })
        .collect();

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title("Virtual Machines"),
        )
        .highlight_style(
            Style::default()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        );

    f.render_widget(list, area);
}

fn render_footer(f: &mut Frame, area: Rect) {
    let footer = Paragraph::new("[q]uit [r]efresh [↑/k] up [↓/j] down [s]tart s[t]op [d]elete")
        .style(Style::default().fg(Color::Gray))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(footer, area);
}
