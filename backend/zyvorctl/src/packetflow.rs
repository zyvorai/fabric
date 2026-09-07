// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Color / plain Hubble-style text for `zyvorctl dataplane hubble`.

const RESET: &str = "\x1b[0m";
const GREEN: &str = "\x1b[32m";
const RED: &str = "\x1b[31m";
const YELLOW: &str = "\x1b[33m";
const BLUE: &str = "\x1b[34m";
const CYAN: &str = "\x1b[36m";

fn paint(color: bool, code: &str, text: &str) -> String {
    if color {
        format!("{code}{text}{RESET}")
    } else {
        text.to_string()
    }
}

pub fn render_hubble_json(val: &serde_json::Value, output: &str) -> String {
    let color = matches!(output.to_ascii_lowercase().as_str(), "color" | "colour");
    let items = val
        .get("items")
        .and_then(|v| v.as_array())
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        return "(no flows)\n".into();
    }
    let mut out = String::new();
    for item in items {
        let verdict = item
            .get("verdict")
            .and_then(|v| v.as_str())
            .unwrap_or("FORWARDED");
        let vtxt = match verdict {
            "DROPPED" => paint(color, RED, verdict),
            "AUDIT" => paint(color, YELLOW, verdict),
            _ => paint(color, GREEN, verdict),
        };
        let dir = item
            .get("traffic_direction")
            .and_then(|v| v.as_str())
            .unwrap_or("EGRESS");
        let ip = item.get("IP").cloned().unwrap_or(serde_json::json!({}));
        let l4 = item.get("l4").cloned().unwrap_or(serde_json::json!({}));
        let src = format!(
            "{}:{}",
            ip.get("source").and_then(|v| v.as_str()).unwrap_or("?"),
            l4.get("source_port").and_then(|v| v.as_u64()).unwrap_or(0)
        );
        let dst = format!(
            "{}:{}",
            ip.get("destination").and_then(|v| v.as_str()).unwrap_or("?"),
            l4.get("destination_port")
                .and_then(|v| v.as_u64())
                .unwrap_or(0)
        );
        let proto = l4.get("protocol").and_then(|v| v.as_str()).unwrap_or("?");
        out.push_str(&format!(
            "{vtxt} {dir} {proto} {src} {arrow} {dst}\n",
            proto = paint(color, CYAN, proto),
            arrow = paint(color, BLUE, "→"),
        ));
        if let Some(hops) = item.get("hops").and_then(|v| v.as_array()) {
            for (i, hop) in hops.iter().enumerate() {
                let name = hop.get("name").and_then(|v| v.as_str()).unwrap_or("?");
                let role = hop.get("role").and_then(|v| v.as_str()).unwrap_or("");
                let detail = hop.get("detail").and_then(|v| v.as_str()).unwrap_or("");
                let branch = if i + 1 == hops.len() { "└─" } else { "├─" };
                out.push_str(&format!("  {branch} [{i}] {name} ({role})  {detail}\n"));
            }
        }
        out.push('\n');
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_has_no_ansi_color_does() {
        let val = serde_json::json!({
            "items": [{
                "verdict": "DROPPED",
                "traffic_direction": "EGRESS",
                "IP": {"source": "10.0.0.2", "destination": "1.1.1.1"},
                "l4": {"protocol": "tcp", "source_port": 1, "destination_port": 443},
                "hops": [{"name": "tap", "role": "l2", "detail": "pair"}]
            }]
        });
        let color = render_hubble_json(&val, "color");
        let plain = render_hubble_json(&val, "plain");
        assert!(color.contains("\u{1b}["));
        assert!(!plain.contains("\u{1b}["));
        assert!(plain.contains("tap"));
        assert!(plain.contains("DROPPED"));
    }
}
