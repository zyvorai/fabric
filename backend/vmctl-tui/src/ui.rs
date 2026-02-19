use crate::app::{App, View};
use crate::views;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Paragraph, Sparkline},
    Frame,
};

pub fn ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Tabs
            Constraint::Min(0),     // Content
            Constraint::Length(3),  // Footer
        ])
        .split(f.area());

    // Render tabs
    views::render_tabs(f, app, chunks[0]);

    // Render content based on current view
    match app.current_view {
        View::Dashboard => views::render_dashboard(f, app, chunks[1]),
        View::VMs => views::render_vms_view(f, app, chunks[1]),
        View::Logs => render_logs_view(f, chunks[1]),
        View::Metrics => render_metrics_view(f, app, chunks[1]),
        View::Network => render_network_view(f, chunks[1]),
        View::Storage => render_storage_view(f, chunks[1]),
        View::Help => views::render_help(f, chunks[1]),
    }

    // Render footer
    render_footer(f, app, chunks[2]);
}

fn render_logs_view(f: &mut Frame, area: Rect) {
    let logs = vec![
        Line::from(vec![
            Span::styled("[2026-02-19 12:34:56] ", Style::default().fg(Color::DarkGray)),
            Span::styled("INFO  ", Style::default().fg(Color::Cyan)),
            Span::raw("vmspawnd: VM 'web-01' started successfully"),
        ]),
        Line::from(vec![
            Span::styled("[2026-02-19 12:34:45] ", Style::default().fg(Color::DarkGray)),
            Span::styled("WARN  ", Style::default().fg(Color::Yellow)),
            Span::raw("vmspawnd: High memory usage on 'db-01': 95%"),
        ]),
        Line::from(vec![
            Span::styled("[2026-02-19 12:34:30] ", Style::default().fg(Color::DarkGray)),
            Span::styled("INFO  ", Style::default().fg(Color::Cyan)),
            Span::raw("vmspawnd: Network bridge 'br0' configured"),
        ]),
        Line::from(vec![
            Span::styled("[2026-02-19 12:34:15] ", Style::default().fg(Color::DarkGray)),
            Span::styled("ERROR ", Style::default().fg(Color::Red)),
            Span::raw("vmspawnd: Failed to start 'test-vm': insufficient resources"),
        ]),
    ];

    let paragraph = Paragraph::new(logs)
        .block(Block::default().borders(Borders::ALL).title(" System Logs "))
        .style(Style::default());

    f.render_widget(paragraph, area);
}

fn render_metrics_view(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(7),
            Constraint::Length(7),
            Constraint::Length(7),
            Constraint::Min(0),
        ])
        .split(area);

    // CPU Metrics with Sparkline
    let cpu_value = app.cpu_history.last().unwrap_or(&0.0);
    let cpu_sparkline = Sparkline::default()
        .block(Block::default().borders(Borders::ALL).title(" CPU Usage "))
        .data(&app.cpu_history.iter().map(|&v| v as u64).collect::<Vec<_>>())
        .style(Style::default().fg(Color::Cyan))
        .max(100);
    f.render_widget(cpu_sparkline, chunks[0]);

    // Add CPU percentage text
    let cpu_text = Paragraph::new(format!("Current: {:.1}%", cpu_value))
        .style(Style::default().fg(Color::Cyan));
    let text_area = Rect {
        x: chunks[0].x + 2,
        y: chunks[0].y + chunks[0].height - 2,
        width: chunks[0].width - 4,
        height: 1,
    };
    f.render_widget(cpu_text, text_area);

    // Memory Metrics with Sparkline
    let mem_value = app.memory_history.last().unwrap_or(&0.0);
    let mem_sparkline = Sparkline::default()
        .block(Block::default().borders(Borders::ALL).title(" Memory Usage "))
        .data(&app.memory_history.iter().map(|&v| v as u64).collect::<Vec<_>>())
        .style(Style::default().fg(Color::Green))
        .max(100);
    f.render_widget(mem_sparkline, chunks[1]);

    let mem_text = Paragraph::new(format!("Current: {:.1}%", mem_value))
        .style(Style::default().fg(Color::Green));
    let text_area = Rect {
        x: chunks[1].x + 2,
        y: chunks[1].y + chunks[1].height - 2,
        width: chunks[1].width - 4,
        height: 1,
    };
    f.render_widget(mem_text, text_area);

    // Network I/O with Sparklines
    let net_chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(chunks[2]);

    let rx_value = app.network_rx_history.last().unwrap_or(&0.0);
    let rx_sparkline = Sparkline::default()
        .block(Block::default().borders(Borders::ALL).title(" Network RX "))
        .data(&app.network_rx_history.iter().map(|&v| v as u64).collect::<Vec<_>>())
        .style(Style::default().fg(Color::Yellow))
        .max(100);
    f.render_widget(rx_sparkline, net_chunks[0]);

    let rx_text = Paragraph::new(format!("{:.1} MB/s", rx_value))
        .style(Style::default().fg(Color::Yellow));
    let text_area = Rect {
        x: net_chunks[0].x + 2,
        y: net_chunks[0].y + net_chunks[0].height - 2,
        width: net_chunks[0].width - 4,
        height: 1,
    };
    f.render_widget(rx_text, text_area);

    let tx_value = app.network_tx_history.last().unwrap_or(&0.0);
    let tx_sparkline = Sparkline::default()
        .block(Block::default().borders(Borders::ALL).title(" Network TX "))
        .data(&app.network_tx_history.iter().map(|&v| v as u64).collect::<Vec<_>>())
        .style(Style::default().fg(Color::Magenta))
        .max(100);
    f.render_widget(tx_sparkline, net_chunks[1]);

    let tx_text = Paragraph::new(format!("{:.1} MB/s", tx_value))
        .style(Style::default().fg(Color::Magenta));
    let text_area = Rect {
        x: net_chunks[1].x + 2,
        y: net_chunks[1].y + net_chunks[1].height - 2,
        width: net_chunks[1].width - 4,
        height: 1,
    };
    f.render_widget(tx_text, text_area);

    // System Info
    let info_text = vec![
        Line::from(Span::styled("System Information", Style::default().add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from("  Uptime:    2 days, 5 hours"),
        Line::from("  Load Avg:  1.23, 1.45, 1.67"),
        Line::from("  Processes: 245 running, 12 sleeping"),
    ];
    let info = Paragraph::new(info_text)
        .block(Block::default().borders(Borders::ALL).title(" System Info "))
        .style(Style::default());
    f.render_widget(info, chunks[3]);
}

fn render_network_view(f: &mut Frame, area: Rect) {
    let text = vec![
        Line::from(Span::styled("Network Configuration", Style::default().add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from("Bridges:"),
        Line::from("  br0  - 192.168.100.1/24  (UP)"),
        Line::from("  br1  - 192.168.200.1/24  (UP)"),
        Line::from(""),
        Line::from("VLANs:"),
        Line::from("  vlan100 on br0"),
        Line::from("  vlan200 on br0"),
    ];

    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL).title(" Network "))
        .style(Style::default());

    f.render_widget(paragraph, area);
}

fn render_storage_view(f: &mut Frame, area: Rect) {
    let text = vec![
        Line::from(Span::styled("Storage Pools", Style::default().add_modifier(Modifier::BOLD))),
        Line::from(""),
        Line::from("default:"),
        Line::from("  Path:     /var/lib/vmspawnd/images"),
        Line::from("  Capacity: 500 GB"),
        Line::from("  Used:     245 GB (49%)"),
        Line::from("  Free:     255 GB"),
        Line::from(""),
        Line::from("Volumes: 12"),
        Line::from("Snapshots: 5"),
    ];

    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL).title(" Storage "))
        .style(Style::default());

    f.render_widget(paragraph, area);
}

fn render_footer(f: &mut Frame, app: &App, area: Rect) {
    let footer_text = if app.bulk_mode {
        format!(
            "[Space] Toggle  [a] All  [A] None  [S] Start  [T] Stop  [D] Delete  [v] Exit Bulk ({} selected)",
            app.selected_vms.len()
        )
    } else {
        match app.current_view {
            View::Dashboard => "[1-6] Views  [Tab] Next  [R] Refresh  [?] Help  [q] Quit".to_string(),
            View::VMs => "[↑/↓] Navigate  [v] Bulk Mode  [s] Start  [t] Stop  [r] Restart  [d] Delete  [q] Quit".to_string(),
            View::Help => "[q] Quit".to_string(),
            _ => "[1-6] Views  [Tab] Next  [q] Quit".to_string(),
        }
    };

    let footer_style = if app.bulk_mode {
        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::Gray)
    };

    let footer = Paragraph::new(footer_text)
        .style(footer_style)
        .block(Block::default().borders(Borders::ALL));

    f.render_widget(footer, area);
}
