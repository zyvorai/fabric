// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
// Proprietary software — see LICENSE in the repository root.
// https://zyvor.dev · info@zyvor.dev

use crate::app::{App, StatusLevel, View};
use crate::views;
use ratatui::{
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph, Sparkline},
    Frame,
};

// GuestKit theme (Machina-aligned)
const ORANGE: Color = Color::Rgb(222, 115, 86);
const LIGHT_ORANGE: Color = Color::Rgb(255, 145, 115);
const TEXT_COLOR: Color = Color::Rgb(220, 220, 220);
const SUCCESS_COLOR: Color = Color::Rgb(50, 205, 50);
const ERROR_COLOR: Color = Color::Rgb(220, 50, 47);
const WARNING_COLOR: Color = Color::Rgb(255, 200, 0);

pub fn ui(f: &mut Frame, app: &App) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(1),
            Constraint::Min(0),
            Constraint::Length(1),
            Constraint::Length(1),
        ])
        .split(f.area());

    render_header_bar(f, chunks[0], app);

    let main = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Length(22), Constraint::Min(0)])
        .split(chunks[1]);

    render_inventory_sidebar(f, main[0], app);
    render_main_content(f, app, main[1]);

    render_recent_tasks_bar(f, chunks[2], app);
    render_bottom_bar(f, chunks[3], app);

    if let Some((ref msg, ref when, ref level)) = app.toast {
        if when.elapsed().as_secs() < 3 {
            render_toast(f, f.area(), msg, *level);
        }
    }
}

fn render_header_bar(f: &mut Frame, area: Rect, app: &App) {
    let running = app.vms.iter().filter(|v| v.state == "running").count();
    let line = Line::from(vec![
        Span::styled(
            " Zyvor Fabric ",
            Style::default().fg(ORANGE).add_modifier(Modifier::BOLD),
        ),
        Span::styled(
            format!("  VMs: {}  running: {} ", app.vms.len(), running),
            Style::default().fg(TEXT_COLOR),
        ),
    ]);
    f.render_widget(Paragraph::new(line), area);
}

fn render_inventory_sidebar(f: &mut Frame, area: Rect, app: &App) {
    let items: Vec<ListItem> = View::all()
        .iter()
        .map(|v| {
            let selected =
                *v == app.current_view || (*v == View::VMs && app.current_view == View::VMDetail);
            ListItem::new(Line::from(Span::styled(
                v.title(),
                if selected {
                    Style::default()
                        .fg(LIGHT_ORANGE)
                        .add_modifier(Modifier::BOLD)
                } else {
                    Style::default().fg(TEXT_COLOR)
                },
            )))
        })
        .collect();

    let list = List::new(items).block(
        Block::default()
            .borders(Borders::ALL)
            .title(Span::styled(" INVENTORY ", Style::default().fg(ORANGE))),
    );
    f.render_widget(list, area);
}

fn render_main_content(f: &mut Frame, app: &App, area: Rect) {
    match app.current_view {
        View::Dashboard => views::render_dashboard(f, app, area),
        View::VMs => views::render_vms_view(f, app, area),
        View::Logs => render_logs_view(f, app, area),
        View::Metrics => render_metrics_view(f, app, area),
        View::Network => render_network_view(f, app, area),
        View::NetSecurity => render_netsec_view(f, app, area),
        View::Storage => render_storage_view(f, app, area),
        View::Help => views::render_help(f, area),
        View::VMDetail => views::render_vm_detail_view(f, app, area),
    }
}

fn render_recent_tasks_bar(f: &mut Frame, area: Rect, app: &App) {
    let text = if app.recent_tasks.is_empty() {
        " Recent: (none) ".to_string()
    } else {
        format!(" Recent: {} ", app.recent_tasks.join(" · "))
    };
    f.render_widget(
        Paragraph::new(text).style(Style::default().fg(Color::DarkGray)),
        area,
    );
}

fn render_bottom_bar(f: &mut Frame, area: Rect, app: &App) {
    if app.command_mode {
        let line = Line::from(vec![
            Span::styled(": ", Style::default().fg(ORANGE)),
            Span::raw(app.command_buffer.clone()),
            Span::styled("█", Style::default().fg(ORANGE)),
        ]);
        f.render_widget(Paragraph::new(line), area);
        return;
    }
    if app.search_mode {
        let line = Line::from(vec![
            Span::styled("/ ", Style::default().fg(ORANGE)),
            Span::raw(app.search_query.clone()),
        ]);
        f.render_widget(Paragraph::new(line), area);
        return;
    }

    let hints = " q quit  R refresh  / search  : command  ? help  j/k nav  Enter detail ";
    f.render_widget(
        Paragraph::new(hints).style(Style::default().fg(Color::DarkGray)),
        area,
    );

    // Status messages overlay on second line if we had more space — show latest in header area via views::render_status_bar in content when pending
    if app.pending_action.is_some() {
        views::render_status_bar(f, app, area);
    }
}

fn render_toast(f: &mut Frame, area: Rect, msg: &str, level: StatusLevel) {
    let color = match level {
        StatusLevel::Success => SUCCESS_COLOR,
        StatusLevel::Warning => WARNING_COLOR,
        StatusLevel::Error => ERROR_COLOR,
    };
    let w = (msg.len() as u16 + 4)
        .min(area.width.saturating_sub(2))
        .max(20);
    let h = 3u16;
    let x = area.width.saturating_sub(w + 1);
    let rect = Rect::new(x, 1, w, h);
    f.render_widget(Clear, rect);
    f.render_widget(
        Paragraph::new(msg)
            .block(
                Block::default()
                    .borders(Borders::ALL)
                    .border_style(Style::default().fg(color)),
            )
            .style(Style::default().fg(TEXT_COLOR))
            .wrap(ratatui::widgets::Wrap { trim: true }),
        rect,
    );
}

fn render_logs_view(f: &mut Frame, app: &App, area: Rect) {
    if app.log_entries.is_empty() {
        let msg = Paragraph::new(
            "  No audit log entries available. Logs are fetched from /api/audit/logs.",
        )
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" System Logs "),
        )
        .style(Style::default().fg(Color::DarkGray));
        f.render_widget(msg, area);
        return;
    }

    let logs: Vec<Line> = app
        .log_entries
        .iter()
        .map(|entry| {
            let timestamp = entry
                .get("timestamp")
                .or_else(|| entry.get("created"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let ts_short = if timestamp.len() > 19 {
                &timestamp[..19]
            } else {
                timestamp
            };

            let level = entry
                .get("level")
                .or_else(|| entry.get("severity"))
                .and_then(|v| v.as_str())
                .unwrap_or("INFO");
            let level_color = match level.to_uppercase().as_str() {
                "ERROR" | "CRITICAL" => Color::Red,
                "WARN" | "WARNING" => Color::Yellow,
                "DEBUG" => Color::DarkGray,
                _ => Color::Cyan,
            };

            let action = entry.get("action").and_then(|v| v.as_str()).unwrap_or("");
            let resource = entry
                .get("resource_type")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let detail = entry
                .get("detail")
                .or_else(|| entry.get("message"))
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let message = if !action.is_empty() {
                format!("{} {} {}", action, resource, detail)
            } else {
                detail.to_string()
            };

            Line::from(vec![
                Span::styled(
                    format!("[{}] ", ts_short),
                    Style::default().fg(Color::DarkGray),
                ),
                Span::styled(
                    format!("{:<6}", level.to_uppercase()),
                    Style::default().fg(level_color),
                ),
                Span::raw(message),
            ])
        })
        .collect();

    let paragraph = Paragraph::new(logs)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" System Logs ({}) ", app.log_entries.len())),
        )
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
        .data(
            &app.cpu_history
                .iter()
                .map(|&v| v as u64)
                .collect::<Vec<_>>(),
        )
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
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Memory Usage "),
        )
        .data(
            &app.memory_history
                .iter()
                .map(|&v| v as u64)
                .collect::<Vec<_>>(),
        )
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
        .data(
            &app.network_rx_history
                .iter()
                .map(|&v| v as u64)
                .collect::<Vec<_>>(),
        )
        .style(Style::default().fg(Color::Yellow))
        .max(100);
    f.render_widget(rx_sparkline, net_chunks[0]);

    let rx_text =
        Paragraph::new(format!("{:.1} MB/s", rx_value)).style(Style::default().fg(Color::Yellow));
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
        .data(
            &app.network_tx_history
                .iter()
                .map(|&v| v as u64)
                .collect::<Vec<_>>(),
        )
        .style(Style::default().fg(Color::Magenta))
        .max(100);
    f.render_widget(tx_sparkline, net_chunks[1]);

    let tx_text =
        Paragraph::new(format!("{:.1} MB/s", tx_value)).style(Style::default().fg(Color::Magenta));
    let text_area = Rect {
        x: net_chunks[1].x + 2,
        y: net_chunks[1].y + net_chunks[1].height - 2,
        width: net_chunks[1].width - 4,
        height: 1,
    };
    f.render_widget(tx_text, text_area);

    // System Info - from API or fallback
    let mut info_text = vec![
        Line::from(Span::styled(
            "System Information",
            Style::default().add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
    ];
    if let Some(ref sys) = app.system_info {
        let total = sys.get("total_bytes").and_then(|v| v.as_u64()).unwrap_or(0);
        let available = sys
            .get("available_bytes")
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        let used = total.saturating_sub(available);
        let total_gb = total as f64 / (1024.0 * 1024.0 * 1024.0);
        let used_gb = used as f64 / (1024.0 * 1024.0 * 1024.0);
        info_text.push(Line::from(format!(
            "  Memory:  {:.1} / {:.1} GB",
            used_gb, total_gb
        )));
        if let Some(swap_total) = sys.get("swap_total_bytes").and_then(|v| v.as_u64()) {
            let swap_gb = swap_total as f64 / (1024.0 * 1024.0 * 1024.0);
            info_text.push(Line::from(format!("  Swap:    {:.1} GB total", swap_gb)));
        }
    }
    let running = app
        .vms
        .iter()
        .filter(|v| v.state == vm_model::VMState::Running)
        .count();
    let total_vms = app.vms.len();
    info_text.push(Line::from(format!(
        "  VMs:     {} total, {} running",
        total_vms, running
    )));
    info_text.push(Line::from(format!(
        "  Storage: {} pools",
        app.storage_pools.len()
    )));

    let info = Paragraph::new(info_text)
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" System Info "),
        )
        .style(Style::default());
    f.render_widget(info, chunks[3]);
}

fn render_network_view(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([Constraint::Min(0), Constraint::Length(8)])
        .split(area);

    let mut text = vec![
        Line::from(Span::styled(
            "Network Configuration",
            Style::default().add_modifier(Modifier::BOLD),
        )),
        Line::from(""),
    ];

    // Bridges from API
    text.push(Line::from(Span::styled(
        format!("Bridges ({})", app.bridges.len()),
        Style::default()
            .fg(Color::Cyan)
            .add_modifier(Modifier::BOLD),
    )));
    if app.bridges.is_empty() {
        text.push(Line::from(Span::styled(
            "  No bridges configured",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for br in &app.bridges {
            let name = br.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let addrs = br
                .get("addresses")
                .and_then(|v| v.as_array())
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str())
                        .collect::<Vec<_>>()
                        .join(", ")
                })
                .unwrap_or_else(|| "-".to_string());
            let dhcp = br.get("dhcp").and_then(|v| v.as_str()).unwrap_or("no");
            text.push(Line::from(vec![
                Span::styled(format!("  {:<12}", name), Style::default().fg(Color::Green)),
                Span::raw(format!("{:<30} dhcp={}", addrs, dhcp)),
            ]));
        }
    }

    text.push(Line::from(""));

    // VLANs from API
    text.push(Line::from(Span::styled(
        format!("VLANs ({})", app.vlans.len()),
        Style::default()
            .fg(Color::Magenta)
            .add_modifier(Modifier::BOLD),
    )));
    if app.vlans.is_empty() {
        text.push(Line::from(Span::styled(
            "  No VLANs configured",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for vl in &app.vlans {
            let name = vl.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let vid = vl.get("vlan_id").and_then(|v| v.as_u64()).unwrap_or(0);
            let parent = vl
                .get("parent_interface")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            text.push(Line::from(vec![
                Span::styled(
                    format!("  {:<12}", name),
                    Style::default().fg(Color::Yellow),
                ),
                Span::raw(format!("id={} on {}", vid, parent)),
            ]));
        }
    }

    let paragraph = Paragraph::new(text)
        .block(Block::default().borders(Borders::ALL).title(" Network "))
        .style(Style::default());
    f.render_widget(paragraph, chunks[0]);

    // Links status
    let mut link_lines = vec![Line::from(Span::styled(
        "Link Status",
        Style::default().add_modifier(Modifier::BOLD),
    ))];
    if app.links.is_empty() {
        link_lines.push(Line::from(Span::styled(
            "  No link data available",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for lk in &app.links {
            let name = lk.get("name").and_then(|v| v.as_str()).unwrap_or("?");
            let kind = lk.get("kind").and_then(|v| v.as_str()).unwrap_or("");
            let op_state = lk
                .get("operational_state")
                .and_then(|v| v.as_str())
                .unwrap_or("?");
            let state_color = if op_state.contains("routable") || op_state.contains("carrier") {
                Color::Green
            } else {
                Color::Gray
            };
            link_lines.push(Line::from(vec![
                Span::styled(format!("  {:<12}", name), Style::default()),
                Span::styled(format!("{:<10}", kind), Style::default().fg(Color::Cyan)),
                Span::styled(op_state, Style::default().fg(state_color)),
            ]));
        }
    }
    let links_p = Paragraph::new(link_lines).block(
        Block::default()
            .borders(Borders::ALL)
            .title(format!(" Links ({}) ", app.links.len())),
    );
    f.render_widget(links_p, chunks[1]);
}

fn render_netsec_view(f: &mut Frame, app: &App, area: Rect) {
    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // Sub-tabs
            Constraint::Length(3), // Stats
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
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(" Network Security "),
        )
        .highlight_style(Style::default().fg(Color::Yellow))
        .select(app.netsec_tab);
    f.render_widget(tabs, chunks[0]);

    // Stats row
    let stat_colors = [
        Color::Blue,
        Color::Red,
        Color::Cyan,
        Color::Magenta,
        Color::Green,
        Color::Yellow,
        Color::LightYellow,
        Color::LightMagenta,
        Color::LightCyan,
    ];
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
    let stats_text: Vec<Span> = tab_names
        .iter()
        .enumerate()
        .map(|(i, name)| {
            Span::styled(
                format!(" {}:{} ", name, stat_counts[i]),
                Style::default().fg(stat_colors[i]),
            )
        })
        .collect();
    let stats_line =
        Paragraph::new(Line::from(stats_text)).block(Block::default().borders(Borders::ALL));
    f.render_widget(stats_line, chunks[1]);

    // Resource list
    let items = app.netsec_current_items();
    if items.is_empty() {
        let msg = Paragraph::new(format!(
            "No {} configured.",
            tab_names[app.netsec_tab].to_lowercase()
        ))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .title(format!(" {} ", tab_names[app.netsec_tab])),
        )
        .style(Style::default().fg(Color::DarkGray));
        f.render_widget(msg, chunks[2]);
    } else {
        let content_chunks = Layout::default()
            .direction(Direction::Horizontal)
            .constraints([Constraint::Percentage(50), Constraint::Percentage(50)])
            .split(chunks[2]);

        // Left: list
        let list_items: Vec<ListItem> = items
            .iter()
            .enumerate()
            .map(|(i, item)| {
                let name = item
                    .get("name")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unnamed");
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
                            Style::default()
                                .fg(Color::Yellow)
                                .add_modifier(Modifier::BOLD)
                        } else {
                            Style::default()
                        },
                    ),
                ]);
                ListItem::new(content)
            })
            .collect();

        let list =
            List::new(list_items).block(Block::default().borders(Borders::ALL).title(format!(
                " {} ({}) ",
                tab_names[app.netsec_tab],
                items.len()
            )));
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
                                let pairs: Vec<String> = o
                                    .iter()
                                    .map(|(k, v)| {
                                        format!(
                                            "{}={}",
                                            k,
                                            match v {
                                                serde_json::Value::String(s) => s.clone(),
                                                _ => v.to_string(),
                                            }
                                        )
                                    })
                                    .collect();
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
        lines.push(Line::from(Span::styled(
            "  No storage pools configured",
            Style::default().fg(Color::DarkGray),
        )));
    } else {
        for (i, pool) in app.storage_pools.iter().enumerate() {
            let name = pool
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unnamed");
            let state = pool
                .get("state")
                .and_then(|v| v.as_str())
                .unwrap_or("Unknown");
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

            let marker = if i == app.storage_selected {
                "► "
            } else {
                "  "
            };
            lines.push(Line::from(vec![
                Span::styled(marker, Style::default().fg(Color::Yellow)),
                Span::styled(
                    format!("{:<18}", name),
                    if i == app.storage_selected {
                        Style::default()
                            .fg(Color::Yellow)
                            .add_modifier(Modifier::BOLD)
                    } else {
                        Style::default()
                    },
                ),
                Span::styled(
                    format!("{:<10}", pool_type),
                    Style::default().fg(Color::Cyan),
                ),
                Span::styled(state, Style::default().fg(state_color)),
            ]));
        }
    }

    let pool_list = Paragraph::new(lines).block(
        Block::default()
            .borders(Borders::ALL)
            .title(format!(" Storage Pools ({}) ", app.storage_pools.len())),
    );
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
                detail_lines.push(Line::from(Span::styled(
                    "Ceph Details",
                    Style::default()
                        .add_modifier(Modifier::BOLD)
                        .fg(Color::Magenta),
                )));
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
                    let status = health
                        .get("status")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown");
                    let health_color = match status {
                        "Ok" | "HEALTH_OK" => Color::Green,
                        "Warn" | "HEALTH_WARN" => Color::Yellow,
                        _ => Color::Red,
                    };
                    detail_lines.push(Line::from(vec![
                        Span::styled("Health:   ", Style::default().fg(Color::Cyan)),
                        Span::styled(
                            status,
                            Style::default()
                                .fg(health_color)
                                .add_modifier(Modifier::BOLD),
                        ),
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
        detail_lines.push(Line::from(Span::styled(
            "No pool selected",
            Style::default().fg(Color::DarkGray),
        )));
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
            View::VMs => "[↑/↓] Navigate  [v] Bulk Mode  [s] Start  [t] Stop  [r] Restart  [b] Backup  [d] Delete  [q] Quit".to_string(),
            View::NetSecurity => "[←/→] Tabs  [↑/↓] Navigate  [S] Sync  [d] Delete  [q] Quit".to_string(),
            View::Help => "[q] Quit".to_string(),
            _ => "[1-7] Views  [Tab] Next  [q] Quit".to_string(),
        }
    };

    let footer_style = if app.bulk_mode {
        Style::default()
            .fg(Color::Yellow)
            .add_modifier(Modifier::BOLD)
    } else {
        Style::default().fg(Color::Gray)
    };

    let footer = Paragraph::new(footer_text)
        .style(footer_style)
        .block(Block::default().borders(Borders::ALL));

    f.render_widget(footer, area);
}
