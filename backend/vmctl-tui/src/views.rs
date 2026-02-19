use crate::app::{App, View};
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph, Tabs},
    Frame,
};

impl View {
    pub fn title(&self) -> &str {
        match self {
            View::Dashboard => "Dashboard",
            View::VMs => "Virtual Machines",
            View::Logs => "Logs",
            View::Metrics => "Metrics",
            View::Network => "Network",
            View::Storage => "Storage",
            View::Help => "Help",
        }
    }

    pub fn all() -> Vec<View> {
        vec![
            View::Dashboard,
            View::VMs,
            View::Logs,
            View::Metrics,
            View::Network,
            View::Storage,
            View::Help,
        ]
    }
}

pub fn render_tabs(f: &mut Frame, app: &App, area: Rect) {
    let all_views = View::all();
    let titles: Vec<Line> = all_views
        .iter()
        .map(|v| {
            let title = v.title();
            Line::from(Span::styled(
                title,
                if *v == app.current_view {
                    Style::default()
                        .fg(Color::Yellow)
                        .add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
                } else {
                    Style::default().fg(Color::White)
                },
            ))
        })
        .collect();

    let tabs = Tabs::new(titles)
        .block(Block::default().borders(Borders::ALL).title(" vmspawnd TUI "))
        .highlight_style(Style::default().fg(Color::Yellow))
        .select(app.current_view as usize);

    f.render_widget(tabs, area);
}

pub fn render_dashboard(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),
            Constraint::Min(10),
            Constraint::Length(8),
        ])
        .split(area);

    // Stats row
    let stats_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([
            Constraint::Percentage(25),
            Constraint::Percentage(25),
            Constraint::Percentage(25),
            Constraint::Percentage(25),
        ])
        .split(chunks[0]);

    render_stat_box(f, "Total VMs", &app.vms.len().to_string(), Color::Cyan, stats_chunks[0]);

    let running = app.vms.iter().filter(|v| v.state == vm_model::VMState::Running).count();
    render_stat_box(f, "Running", &running.to_string(), Color::Green, stats_chunks[1]);

    let stopped = app.vms.iter().filter(|v| v.state == vm_model::VMState::Stopped).count();
    render_stat_box(f, "Stopped", &stopped.to_string(), Color::Red, stats_chunks[2]);

    render_stat_box(f, "CPU Usage", "45%", Color::Yellow, stats_chunks[3]);

    // VM List
    render_vm_list_compact(f, app, chunks[1]);

    // Activity log
    render_activity_log(f, app, chunks[2]);
}

fn render_stat_box(f: &mut Frame, title: &str, value: &str, color: Color, area: Rect) {
    let text = vec![
        Line::from(Span::styled(title, Style::default().fg(Color::Gray))),
        Line::from(Span::styled(
            value,
            Style::default()
                .fg(color)
                .add_modifier(Modifier::BOLD),
        )),
    ];

    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL))
        .style(Style::default());

    f.render_widget(paragraph, area);
}

fn render_vm_list_compact(f: &mut Frame, app: &App, area: Rect) {
    let filtered_vms = app.filtered_vms();
    let items: Vec<ListItem> = filtered_vms
        .iter()
        .enumerate()
        .map(|(i, vm)| {
            let state_symbol = match vm.state {
                vm_model::VMState::Running => "●",
                vm_model::VMState::Stopped => "○",
                vm_model::VMState::Paused => "◐",
                _ => "?",
            };

            let state_color = match vm.state {
                vm_model::VMState::Running => Color::Green,
                vm_model::VMState::Stopped => Color::Red,
                vm_model::VMState::Paused => Color::Yellow,
                _ => Color::Gray,
            };

            let content = vec![Line::from(vec![
                Span::styled(state_symbol, Style::default().fg(state_color)),
                Span::raw(" "),
                Span::styled(
                    format!("{:<20}", vm.name),
                    if i == app.selected {
                        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                ),
                Span::raw(format!("{}C ", vm.cpus)),
                Span::raw(format!("{}MB", vm.memory)),
            ])];

            ListItem::new(content)
        })
        .collect();

    let list = List::new(items)
        .block(Block::default().borders(Borders::ALL).title(" VMs "))
        .highlight_style(
            Style::default()
                .bg(Color::DarkGray)
                .add_modifier(Modifier::BOLD),
        );

    f.render_widget(list, area);
}

fn render_activity_log(f: &mut Frame, _app: &App, area: Rect) {
    let logs = vec![
        Line::from(vec![
            Span::styled("[12:34:56] ", Style::default().fg(Color::DarkGray)),
            Span::styled("INFO  ", Style::default().fg(Color::Cyan)),
            Span::raw("VM 'web-server' started successfully"),
        ]),
        Line::from(vec![
            Span::styled("[12:34:45] ", Style::default().fg(Color::DarkGray)),
            Span::styled("WARN  ", Style::default().fg(Color::Yellow)),
            Span::raw("VM 'db-server' memory usage high: 95%"),
        ]),
        Line::from(vec![
            Span::styled("[12:34:30] ", Style::default().fg(Color::DarkGray)),
            Span::styled("INFO  ", Style::default().fg(Color::Cyan)),
            Span::raw("Network bridge 'br0' configured"),
        ]),
    ];

    let paragraph = Paragraph::new(logs)
        .block(Block::default().borders(Borders::ALL).title(" Activity Log "))
        .style(Style::default());

    f.render_widget(paragraph, area);
}

pub fn render_vms_view(f: &mut Frame, app: &App, area: Rect) {
    let chunks = if !app.search_query.is_empty() || app.search_mode {
        Layout::default()
            .direction(Direction::Vertical)
            .constraints([
                Constraint::Length(3),  // Search bar
                Constraint::Min(0),     // Content
            ])
            .split(area)
    } else {
        Layout::default()
            .direction(Direction::Vertical)
            .constraints([Constraint::Min(0)])
            .split(area)
    };

    let content_area = if !app.search_query.is_empty() || app.search_mode {
        // Render search bar
        let search_text = if app.search_mode {
            format!("Search: {}█", app.search_query)
        } else {
            format!("Filter: {} (Press / to search, Esc to clear)", app.search_query)
        };

        let search_bar = Paragraph::new(search_text)
            .style(Style::default().fg(if app.search_mode { Color::Yellow } else { Color::Cyan }))
            .block(Block::default().borders(Borders::ALL));

        f.render_widget(search_bar, chunks[0]);
        chunks[1]
    } else {
        chunks[0]
    };

    let main_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(60), Constraint::Percentage(40)])
        .split(content_area);

    // VM List
    render_vm_list_detailed(f, app, main_chunks[0]);

    // VM Details
    let filtered = app.filtered_vms();
    if let Some(vm) = filtered.get(app.selected) {
        render_vm_details(f, vm, main_chunks[1]);
    }
}

fn render_vm_list_detailed(f: &mut Frame, app: &App, area: Rect) {
    let header_text = if app.bulk_mode {
        "☑ Name                State    CPU  Memory"
    } else {
        "  Name                State    CPU  Memory"
    };

    let header = ListItem::new(Line::from(Span::styled(
        header_text,
        Style::default().add_modifier(Modifier::BOLD)
    )));

    let mut items = vec![header];

    let filtered_vms = app.filtered_vms();
    items.extend(filtered_vms.iter().enumerate().map(|(i, vm)| {
        let state_color = match vm.state {
            vm_model::VMState::Running => Color::Green,
            vm_model::VMState::Stopped => Color::Red,
            vm_model::VMState::Paused => Color::Yellow,
            _ => Color::Gray,
        };

        let selection_marker = if app.bulk_mode {
            if app.selected_vms.contains(&i) {
                "☑ "
            } else {
                "☐ "
            }
        } else {
            if i == app.selected { "► " } else { "  " }
        };

        let content = vec![Line::from(vec![
            Span::styled(
                selection_marker,
                if app.bulk_mode && app.selected_vms.contains(&i) {
                    Style::default().fg(Color::Green).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                },
            ),
            Span::styled(
                format!("{:<20}", vm.name),
                if i == app.selected {
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                } else {
                    Style::default()
                },
            ),
            Span::styled(
                format!("{:<9}", format!("{:?}", vm.state)),
                Style::default().fg(state_color),
            ),
            Span::raw(format!("{:<5}", vm.cpus)),
            Span::raw(format!("{}MB", vm.memory)),
        ])];

        ListItem::new(content)
    }));

    let list = List::new(items)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Virtual Machines "),
        )
        .highlight_style(Style::default().bg(Color::DarkGray));

    f.render_widget(list, area);
}

fn render_vm_details(f: &mut Frame, vm: &vm_model::VM, area: Rect) {
    let details = vec![
        Line::from(vec![
            Span::styled("Name:     ", Style::default().fg(Color::Cyan)),
            Span::raw(&vm.name),
        ]),
        Line::from(vec![
            Span::styled("State:    ", Style::default().fg(Color::Cyan)),
            Span::styled(
                format!("{:?}", vm.state),
                Style::default().fg(match vm.state {
                    vm_model::VMState::Running => Color::Green,
                    vm_model::VMState::Stopped => Color::Red,
                    _ => Color::Yellow,
                }),
            ),
        ]),
        Line::from(vec![
            Span::styled("CPUs:     ", Style::default().fg(Color::Cyan)),
            Span::raw(vm.cpus.to_string()),
        ]),
        Line::from(vec![
            Span::styled("Memory:   ", Style::default().fg(Color::Cyan)),
            Span::raw(format!("{} MB", vm.memory)),
        ]),
        Line::from(vec![
            Span::styled("Image:    ", Style::default().fg(Color::Cyan)),
            Span::raw(&vm.image),
        ]),
        Line::from(""),
        Line::from(Span::styled("Actions:", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  [s] Start    [t] Stop"),
        Line::from("  [r] Restart  [d] Delete"),
        Line::from("  [c] Console  [m] Metrics"),
    ];

    let paragraph = Paragraph::new(details)
        .block(Block::default().borders(Borders::ALL).title(" Details "))
        .style(Style::default());

    f.render_widget(paragraph, area);
}

pub fn render_help(f: &mut Frame, area: Rect) {
    let help_text = vec![
        Line::from(Span::styled(
            "vmspawnd TUI - Keyboard Shortcuts",
            Style::default()
                .fg(Color::Yellow)
                .add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
        Line::from(Span::styled("Navigation:", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  [1-6]       Switch views (Dashboard, VMs, Logs, etc.)"),
        Line::from("  [↑/k]       Move up"),
        Line::from("  [↓/j]       Move down"),
        Line::from("  [Tab]       Next view"),
        Line::from("  [Shift+Tab] Previous view"),
        Line::from(""),
        Line::from(Span::styled("VM Actions:", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  [s]         Start selected VM"),
        Line::from("  [t]         Stop selected VM"),
        Line::from("  [r]         Restart selected VM"),
        Line::from("  [d]         Delete selected VM"),
        Line::from("  [c]         Open console"),
        Line::from("  [m]         Show metrics"),
        Line::from(""),
        Line::from(Span::styled("General:", Style::default().add_modifier(Modifier::BOLD))),
        Line::from("  [R]         Refresh data"),
        Line::from("  [/]         Search"),
        Line::from("  [?]         Show this help"),
        Line::from("  [q]         Quit"),
    ];

    let paragraph = Paragraph::new(help_text)
        .block(Block::default().borders(Borders::ALL).title(" Help "))
        .style(Style::default());

    f.render_widget(paragraph, area);
}
