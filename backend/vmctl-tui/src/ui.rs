use crate::app::{App, View};
use crate::views;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, List, ListItem, Paragraph, Sparkline, Tabs},
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
        View::NetSecurity => render_netsec_view(f, app, chunks[1]),
        View::Storage => render_storage_view(f, app, chunks[1]),
        View::Help => views::render_help(f, chunks[1]),
        View::VMDetail => views::render_vm_detail_view(f, app, chunks[1]),
    }

    // Render footer with status bar
    let footer_chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),  // Status bar
            Constraint::Length(2),  // Footer
        ])
        .split(chunks[2]);

    views::render_status_bar(f, app, footer_chunks[0]);
    render_footer(f, app, footer_chunks[1]);
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

fn render_netsec_view(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),  // Sub-tabs
            Constraint::Length(3),  // Stats
            Constraint::Min(0),    // Content
        ])
        .split(area);

    // Sub-tabs for each resource type
    let tab_names = app.netsec_tab_names();
    let titles: Vec<Line> = tab_names
        .iter()
        .enumerate()
        .map(|(i, name)| {
            Line::from(Span::styled(
                *name,
                if i == app.netsec_tab {
                    Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD | Modifier::UNDERLINED)
                } else {
                    Style::default().fg(Color::White)
                },
            ))
        })
        .collect();

    let tabs = Tabs::new(titles)
        .block(Block::default().borders(Borders::ALL).title(" Network Security "))
        .highlight_style(Style::default().fg(Color::Yellow))
        .select(app.netsec_tab);
    f.render_widget(tabs, chunks[0]);

    // Stats row
    let stat_colors = [Color::Blue, Color::Red, Color::Cyan, Color::Magenta, Color::Green, Color::Yellow, Color::LightYellow, Color::LightMagenta, Color::LightCyan];
    let stat_counts = [
        app.net_policies.len(),
        app.fw_profiles.len(),
        app.services.len(),
        app.qos_policies.len(),
        app.dns_zones.len(),
        app.vpn_tunnels.len(),
        app.mirror_sessions.len(),
        app.nat_rules.len(),
        app.monitor_policies.len(),
    ];
    let stats_text: Vec<Span> = tab_names.iter().enumerate().map(|(i, name)| {
        Span::styled(
            format!(" {}:{} ", name, stat_counts[i]),
            Style::default().fg(stat_colors[i]),
        )
    }).collect();
    let stats_line = Paragraph::new(Line::from(stats_text))
        .block(Block::default().borders(Borders::ALL));
    f.render_widget(stats_line, chunks[1]);

    // Resource list
    let items = app.netsec_current_items();
    if items.is_empty() {
        let msg = Paragraph::new(format!("No {} configured.", tab_names[app.netsec_tab].to_lowercase()))
            .block(Block::default().borders(Borders::ALL).title(format!(" {} ", tab_names[app.netsec_tab])))
            .style(Style::default().fg(Color::DarkGray));
        f.render_widget(msg, chunks[2]);
    } else {
        let content_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .split(chunks[2]);

        // Left: list
        let list_items: Vec<ListItem> = items.iter().enumerate().map(|(i, item)| {
            let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed");
            let enabled = item.get("enabled").and_then(|v| v.as_bool());
            let status_sym = match enabled {
                Some(true) => Span::styled("● ", Style::default().fg(Color::Green)),
                Some(false) => Span::styled("○ ", Style::default().fg(Color::Red)),
                None => Span::styled("  ", Style::default()),
            };

            let content = Line::from(vec![
                if i == app.netsec_selected {
                    Span::styled("► ", Style::default().fg(Color::Yellow))
                } else {
                    Span::raw("  ")
                },
                status_sym,
                Span::styled(
                    name.to_string(),
                    if i == app.netsec_selected {
                        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                ),
            ]);
            ListItem::new(content)
        }).collect();

        let list = List::new(list_items)
            .block(Block::default().borders(Borders::ALL).title(format!(" {} ({}) ", tab_names[app.netsec_tab], items.len())));
        f.render_widget(list, content_chunks[0]);

        // Right: detail of selected item
        if let Some(selected_item) = items.get(app.netsec_selected) {
            let mut detail_lines = Vec::new();
            // Show all fields
            if let Some(obj) = selected_item.as_object() {
                for (key, val) in obj {
                    let val_str = match val {
                        serde_json::Value::String(s) => s.clone(),
                        serde_json::Value::Bool(b) => b.to_string(),
                        serde_json::Value::Number(n) => n.to_string(),
                        serde_json::Value::Array(a) => format!("[{} items]", a.len()),
                        serde_json::Value::Object(o) => {
                            if o.len() <= 3 {
                                let pairs: Vec<String> = o.iter().map(|(k, v)| {
                                    format!("{}={}", k, match v { serde_json::Value::String(s) => s.clone(), _ => v.to_string() })
                                }).collect();
                                pairs.join(", ")
                            } else {
                                format!("{{{} keys}}", o.len())
                            }
                        }
                        serde_json::Value::Null => "null".to_string(),
                    };
                    detail_lines.push(Line::from(vec![
                        Span::styled(format!("{:<16}", key), Style::default().fg(Color::Cyan)),
                        Span::raw(val_str),
                    ]));
                }
            }
            let detail = Paragraph::new(detail_lines)
                .block(Block::default().borders(Borders::ALL).title(" Details "));
            f.render_widget(detail, content_chunks[1]);
        }
    }
}

fn render_storage_view(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
        .split(area);

    // Left: pool list
    let mut lines = Vec::new();
    if app.storage_pools.is_empty() {
        lines.push(Line::from(Span::styled("  No storage pools configured", Style::default().fg(Color::DarkGray))));
    } else {
        for (i, pool) in app.storage_pools.iter().enumerate() {
            let name = pool.get("name").and_then(|v| v.as_str()).unwrap_or("unnamed");
            let state = pool.get("state").and_then(|v| v.as_str()).unwrap_or("Unknown");
            let state_color = match state {
                "Active" => Color::Green,
                "Inactive" => Color::Red,
                "Degraded" => Color::Yellow,
                _ => Color::Gray,
            };

            let pool_type = if let Some(pt) = pool.get("pool_type") {
                if pt.is_string() {
                    pt.as_str().unwrap_or("").to_string()
                } else if pt.get("Ceph").is_some() {
                    "Ceph/RBD".to_string()
                } else if pt.get("NFS").is_some() {
                    "NFS".to_string()
                } else if pt.get("ZFS").is_some() {
                    "ZFS".to_string()
                } else if pt.get("LVM").is_some() {
                    "LVM".to_string()
                } else if pt.get("LVMThin").is_some() {
                    "LVM-thin".to_string()
                } else {
                    "Unknown".to_string()
                }
            } else {
                "Unknown".to_string()
            };

            let marker = if i == app.storage_selected { "► " } else { "  " };
            lines.push(Line::from(vec![
                Span::styled(marker, Style::default().fg(Color::Yellow)),
                Span::styled(
                    format!("{:<18}", name),
                    if i == app.storage_selected {
                        Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                ),
                Span::styled(format!("{:<10}", pool_type), Style::default().fg(Color::Cyan)),
                Span::styled(state, Style::default().fg(state_color)),
            ]));
        }
    }

    let pool_list = Paragraph::new(lines)
        .block(Block::default().borders(Borders::ALL).title(format!(" Storage Pools ({}) ", app.storage_pools.len())));
    f.render_widget(pool_list, chunks[0]);

    // Right: details + Ceph info
    let mut detail_lines = Vec::new();

    if let Some(pool) = app.storage_pools.get(app.storage_selected) {
        let name = pool.get("name").and_then(|v| v.as_str()).unwrap_or("-");
        let state = pool.get("state").and_then(|v| v.as_str()).unwrap_or("-");
        let capacity = pool.get("capacity").and_then(|v| v.as_u64()).unwrap_or(0);
        let available = pool.get("available").and_then(|v| v.as_u64()).unwrap_or(0);
        let path = pool.get("path").and_then(|v| v.as_str()).unwrap_or("-");

        detail_lines.push(Line::from(vec![
            Span::styled("Name:     ", Style::default().fg(Color::Cyan)),
            Span::styled(name, Style::default().add_modifier(Modifier::BOLD)),
        ]));
        detail_lines.push(Line::from(vec![
            Span::styled("State:    ", Style::default().fg(Color::Cyan)),
            Span::raw(state),
        ]));
        detail_lines.push(Line::from(vec![
            Span::styled("Path:     ", Style::default().fg(Color::Cyan)),
            Span::raw(path),
        ]));

        let cap_gb = capacity as f64 / (1024.0 * 1024.0 * 1024.0);
        let avail_gb = available as f64 / (1024.0 * 1024.0 * 1024.0);
        detail_lines.push(Line::from(vec![
            Span::styled("Capacity: ", Style::default().fg(Color::Cyan)),
            Span::raw(format!("{:.1} GB", cap_gb)),
        ]));
        detail_lines.push(Line::from(vec![
            Span::styled("Avail:    ", Style::default().fg(Color::Cyan)),
            Span::raw(format!("{:.1} GB", avail_gb)),
        ]));

        // Ceph-specific details
        if let Some(pt) = pool.get("pool_type") {
            if let Some(ceph) = pt.get("Ceph") {
                detail_lines.push(Line::from(""));
                detail_lines.push(Line::from(Span::styled("Ceph Details", Style::default().add_modifier(Modifier::BOLD).fg(Color::Magenta))));
                if let Some(pool_name) = ceph.get("pool_name").and_then(|v| v.as_str()) {
                    detail_lines.push(Line::from(vec![
                        Span::styled("Pool:     ", Style::default().fg(Color::Cyan)),
                        Span::raw(pool_name),
                    ]));
                }
                if let Some(mons) = ceph.get("monitors").and_then(|v| v.as_array()) {
                    let mon_str: Vec<&str> = mons.iter().filter_map(|m| m.as_str()).collect();
                    detail_lines.push(Line::from(vec![
                        Span::styled("Monitors: ", Style::default().fg(Color::Cyan)),
                        Span::raw(mon_str.join(", ")),
                    ]));
                }

                // Health
                if let Some(ref health) = app.ceph_health {
                    let status = health.get("status").and_then(|v| v.as_str()).unwrap_or("Unknown");
                    let health_color = match status {
                        "Ok" | "HEALTH_OK" => Color::Green,
                        "Warn" | "HEALTH_WARN" => Color::Yellow,
                        _ => Color::Red,
                    };
                    detail_lines.push(Line::from(vec![
                        Span::styled("Health:   ", Style::default().fg(Color::Cyan)),
                        Span::styled(status, Style::default().fg(health_color).add_modifier(Modifier::BOLD)),
                    ]));
                }

                // RBD Images
                if !app.ceph_images.is_empty() {
                    detail_lines.push(Line::from(""));
                    detail_lines.push(Line::from(Span::styled(
                        format!("RBD Images ({})", app.ceph_images.len()),
                        Style::default().add_modifier(Modifier::BOLD),
                    )));
                    for img in &app.ceph_images {
                        detail_lines.push(Line::from(format!("  {}", img)));
                    }
                }
            }
        }
    } else {
        detail_lines.push(Line::from(Span::styled("No pool selected", Style::default().fg(Color::DarkGray))));
    }

    let detail = Paragraph::new(detail_lines)
        .block(Block::default().borders(Borders::ALL).title(" Details "));
    f.render_widget(detail, chunks[1]);
}

fn render_footer(f: &mut Frame, app: &App, area: Rect) {
    let footer_text = if app.bulk_mode {
        format!(
            "[Space] Toggle  [a] All  [A] None  [S] Start  [T] Stop  [D] Delete  [v] Exit Bulk ({} selected)",
            app.selected_vms.len()
        )
    } else {
        match app.current_view {
            View::Dashboard => "[1-7] Views  [Tab] Next  [R] Refresh  [?] Help  [q] Quit".to_string(),
            View::VMs => "[↑/↓] Navigate  [v] Bulk Mode  [s] Start  [t] Stop  [r] Restart  [d] Delete  [q] Quit".to_string(),
            View::NetSecurity => "[←/→] Tabs  [↑/↓] Navigate  [S] Sync  [d] Delete  [q] Quit".to_string(),
            View::Help => "[q] Quit".to_string(),
            _ => "[1-7] Views  [Tab] Next  [q] Quit".to_string(),
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
