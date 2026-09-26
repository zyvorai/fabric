//! What a person is shown before they approve a request that sends something.
//!
//! An approval that says only "POST to gmail.googleapis.com, 812 bytes, sha256 ..." asks the person to sign something they cannot read. A
//! credential descriptor may name a `preview` kind; the host then reads the **actual request body** and renders the parts that matter (who
//! gets the mail, the subject and text; when the event is, who is invited). The agent supplies none of it, so it cannot describe one thing
//! and send another.
//!
//! * **Fail closed.** If the body cannot be rendered faithfully (multipart or HTML mail, an unknown encoding, JSON that is not what the API
//!   takes), the request is refused before anything is sent. There is no "approve without seeing it" fallback.
//! * **Bounded and plain.** Every value is length-limited and stripped of control and direction-changing characters, so a subject cannot
//!   be made to display differently from what it is.
//! * **Kept off the permanent record.** The rendering lives on the approval only while it is pending, and never goes into the audit
//!   journal, an operator webhook or a push relay (those carry only the generic prompt). The journal gets `preview_sha256`, and that hash is
//!   part of what the phone signs.

use anyhow::{bail, Context, Result};
use base64::Engine;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};

pub const GMAIL_MESSAGE: &str = "gmail-message";
pub const CALENDAR_EVENT: &str = "calendar-event";

const MAX_VALUE_CHARS: usize = 1000;
const MAX_TEXT_CHARS: usize = 1500;
const MAX_MAIL_BYTES: usize = 256 * 1024;
const MAX_EVENT_BYTES: usize = 64 * 1024;

/// Whether `kind` is a preview this host can render.
pub fn is_known(kind: &str) -> bool {
    matches!(kind, GMAIL_MESSAGE | CALENDAR_EVENT)
}

/// A rendered request: a kind and labelled, plain-text fields in a fixed order.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preview {
    pub kind: &'static str,
    pub fields: Vec<(String, String)>,
}

impl Preview {
    pub fn to_value(&self) -> Value {
        json!({
            "kind": self.kind,
            "fields": self.fields.iter().map(|(l, v)| json!({"label": l, "value": v})).collect::<Vec<_>>(),
        })
    }

    /// Digest of the rendering. It goes into the planned action, so the device signature covers what was shown.
    pub fn sha256(&self) -> String {
        hex::encode(Sha256::digest(self.to_value().to_string().as_bytes()))
    }

    fn push(&mut self, label: &str, value: impl AsRef<str>) {
        self.fields
            .push((label.to_string(), clean(value.as_ref(), MAX_VALUE_CHARS)));
    }
}

/// Renders the request body of `kind`. `query` is the URL's query string, which can change what a request does (a calendar
/// event is emailed to its guests only when `sendUpdates` says so).
pub fn render(kind: &str, body: &[u8], query: Option<&str>) -> Result<Preview> {
    match kind {
        GMAIL_MESSAGE => gmail_message(body),
        CALENDAR_EVENT => calendar_event(body, query),
        other => bail!("unknown preview kind '{other}'"),
    }
}

/// Keeps only what is safe to show: no control characters (newlines and tabs stay), no zero-width or direction-changing
/// characters, and at most `max` characters.
fn clean(text: &str, max: usize) -> String {
    let mut out = String::new();
    let mut count = 0usize;
    let mut cut = false;
    for c in text.chars() {
        let bad = (c.is_control() && c != '\n' && c != '\t')
            || matches!(c, '\u{200B}'..='\u{200F}' | '\u{202A}'..='\u{202E}' | '\u{2060}'..='\u{2064}' | '\u{2066}'..='\u{2069}' | '\u{FEFF}' | '\u{00AD}');
        if bad {
            continue;
        }
        if count == max {
            cut = true;
            break;
        }
        out.push(c);
        count += 1;
    }
    if cut {
        out.push('…');
    }
    out
}

fn json_body(body: &[u8], limit: usize) -> Result<Value> {
    if body.len() > limit {
        bail!(
            "the request is too large to review ({} bytes; the limit is {limit})",
            body.len()
        );
    }
    serde_json::from_slice(body).context("the request body is not JSON")
}

fn gmail_message(body: &[u8]) -> Result<Preview> {
    let v = json_body(body, MAX_MAIL_BYTES * 2)?;
    let nested = v.get("message").and_then(|m| m.get("raw"));
    let top = v.get("raw");
    let raw = match (nested, top) {
        (Some(Value::String(s)), None) | (None, Some(Value::String(s))) => s,
        (Some(_), Some(_)) => bail!("the request has two raw messages"),
        _ => bail!("the request has no raw message to review"),
    };
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(raw.trim_end_matches('='))
        .context("the raw message is not base64url")?;
    if bytes.len() > MAX_MAIL_BYTES {
        bail!("the message is too large to review ({} bytes)", bytes.len());
    }
    let text = String::from_utf8(bytes).context("the message is not UTF-8 text")?;
    let (head, message) = split_headers(&text);
    let headers = parse_headers(head);

    let mut p = Preview {
        kind: GMAIL_MESSAGE,
        fields: vec![],
    };
    let mut content_type = None;
    let mut encoding = None;
    let mut other: Vec<String> = vec![];
    let mut seen_recipient = false;
    for (name, value) in &headers {
        let lower = name.to_ascii_lowercase();
        match lower.as_str() {
            "to" | "cc" | "bcc" | "reply-to" | "from" | "subject" => {
                if matches!(lower.as_str(), "to" | "cc" | "bcc") {
                    seen_recipient = true;
                }
                let label = match lower.as_str() {
                    "to" => "To",
                    "cc" => "Cc",
                    "bcc" => "Bcc (hidden from the others)",
                    "reply-to" => "Replies go to",
                    "from" => "From",
                    _ => "Subject",
                };
                p.push(label, decode_words(value));
            }
            "content-type" => content_type = Some(value.clone()),
            "content-transfer-encoding" => encoding = Some(value.clone()),
            "date" | "message-id" | "mime-version" | "in-reply-to" | "references" => {}
            _ => other.push(name.clone()),
        }
    }
    if !seen_recipient {
        p.fields.insert(0, ("To".into(), "(no recipient)".into()));
    }
    if let Some(ct) = content_type {
        let ct = ct.to_ascii_lowercase();
        let mut parts = ct.split(';').map(str::trim);
        if parts.next() != Some("text/plain") {
            bail!("only plain-text mail can be reviewed here (multipart, HTML and attachments are not supported)");
        }
        for param in parts {
            if let Some(cs) = param.strip_prefix("charset=") {
                if !matches!(cs.trim_matches('"'), "utf-8" | "us-ascii") {
                    bail!("only UTF-8 or ASCII plain-text mail can be reviewed here");
                }
            }
        }
    }
    if let Some(enc) = encoding {
        if !matches!(enc.trim().to_ascii_lowercase().as_str(), "7bit" | "8bit") {
            bail!("only 7bit or 8bit plain-text mail can be reviewed here");
        }
    }
    if !other.is_empty() {
        p.push("Other headers", other.join(", "));
    }
    let total = message.chars().count();
    let shown = clean(message.trim(), MAX_TEXT_CHARS);
    p.fields.push(("Message".into(), shown));
    if total > MAX_TEXT_CHARS {
        p.push(
            "Length",
            format!("{total} characters; only the first {MAX_TEXT_CHARS} are shown"),
        );
    }
    Ok(p)
}

/// The header block and the body, split at the first blank line.
fn split_headers(text: &str) -> (&str, &str) {
    let crlf = text.find("\r\n\r\n").map(|i| (i, 4));
    let lf = text.find("\n\n").map(|i| (i, 2));
    match (crlf, lf) {
        (Some(a), Some(b)) => {
            let (i, n) = if a.0 <= b.0 { a } else { b };
            (&text[..i], &text[i + n..])
        }
        (Some((i, n)), None) | (None, Some((i, n))) => (&text[..i], &text[i + n..]),
        (None, None) => (text, ""),
    }
}

/// Header lines with continuation lines folded in, in order, repeats kept.
fn parse_headers(head: &str) -> Vec<(String, String)> {
    let mut out: Vec<(String, String)> = vec![];
    for line in head.lines() {
        if line.starts_with([' ', '\t']) {
            if let Some(last) = out.last_mut() {
                last.1.push(' ');
                last.1.push_str(line.trim());
            }
        } else if let Some((name, value)) = line.split_once(':') {
            out.push((name.trim().to_string(), value.trim().to_string()));
        }
    }
    out
}

/// Decodes RFC 2047 `=?utf-8?B?...?=` and `=?utf-8?Q?...?=` words. Anything else is left as written.
fn decode_words(value: &str) -> String {
    let mut out = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("=?") {
        out.push_str(&rest[..start]);
        let after = &rest[start + 2..];
        let parsed = (|| {
            let mut it = after.splitn(3, '?');
            let charset = it.next()?;
            let enc = it.next()?;
            let tail = it.next()?;
            let end = tail.find("?=")?;
            if !matches!(charset.to_ascii_lowercase().as_str(), "utf-8" | "us-ascii") {
                return None;
            }
            let data = &tail[..end];
            let bytes = match enc {
                "B" | "b" => base64::engine::general_purpose::STANDARD
                    .decode(data)
                    .ok()?,
                "Q" | "q" => {
                    let raw = data.as_bytes();
                    let mut b = vec![];
                    let mut i = 0;
                    while i < raw.len() {
                        match raw[i] {
                            b'_' => b.push(b' '),
                            b'=' if i + 2 < raw.len() => {
                                let hex = std::str::from_utf8(&raw[i + 1..i + 3]).ok()?;
                                b.push(u8::from_str_radix(hex, 16).ok()?);
                                i += 2;
                            }
                            b'=' => return None,
                            c => b.push(c),
                        }
                        i += 1;
                    }
                    b
                }
                _ => return None,
            };
            let text = String::from_utf8(bytes).ok()?;
            Some((
                text,
                start + 2 + charset.len() + 1 + enc.len() + 1 + end + 2,
            ))
        })();
        match parsed {
            Some((text, consumed)) => {
                out.push_str(&text);
                rest = &rest[consumed..];
            }
            None => {
                out.push_str("=?");
                rest = &rest[start + 2..];
            }
        }
    }
    out.push_str(rest);
    out
}

fn calendar_event(body: &[u8], query: Option<&str>) -> Result<Preview> {
    let v = json_body(body, MAX_EVENT_BYTES)?;
    let Some(event) = v.as_object() else {
        bail!("the request is not a calendar event");
    };
    let text = |key: &str| -> Result<Option<String>> {
        match event.get(key) {
            None | Some(Value::Null) => Ok(None),
            Some(Value::String(s)) => Ok(Some(s.clone())),
            Some(_) => bail!("the event's '{key}' is not text"),
        }
    };
    let when = |key: &str| -> Result<String> {
        let Some(Value::Object(o)) = event.get(key) else {
            bail!("the event has no '{key}' time");
        };
        let at = match (o.get("dateTime"), o.get("date")) {
            (Some(Value::String(s)), None) => s.clone(),
            (None, Some(Value::String(s))) => format!("{s} (all day)"),
            _ => bail!("the event's '{key}' time is neither a dateTime nor a date"),
        };
        Ok(match o.get("timeZone") {
            Some(Value::String(z)) => format!("{at} {z}"),
            _ => at,
        })
    };

    let mut p = Preview {
        kind: CALENDAR_EVENT,
        fields: vec![],
    };
    p.push(
        "Title",
        text("summary")?.unwrap_or_else(|| "(no title)".into()),
    );
    p.push("Starts", when("start")?);
    p.push("Ends", when("end")?);
    if let Some(loc) = text("location")? {
        p.push("Where", loc);
    }
    match event.get("attendees") {
        None | Some(Value::Null) => {}
        Some(Value::Array(list)) => {
            let mut emails = vec![];
            for a in list {
                match a.get("email") {
                    Some(Value::String(e)) => emails.push(e.clone()),
                    _ => bail!("a guest has no email address"),
                }
            }
            if !emails.is_empty() {
                p.push("Guests", emails.join(", "));
            }
        }
        Some(_) => bail!("the event's 'attendees' is not a list"),
    }
    let notify = query_value(query, "sendUpdates");
    let legacy = query_value(query, "sendNotifications");
    let guests = event
        .get("attendees")
        .and_then(Value::as_array)
        .is_some_and(|a| !a.is_empty());
    if guests {
        p.push(
            "Guests are emailed",
            match (notify.as_deref(), legacy.as_deref()) {
                (Some("all"), _) => "yes, all of them",
                (Some("externalOnly"), _) => "yes, guests outside your organization",
                (Some("none"), _) => "no",
                (None, Some("true")) => "yes, all of them",
                _ => "no",
            },
        );
    }
    if let Some(rule) = event.get("recurrence") {
        p.push("Repeats", rule.to_string());
    }
    if let Some(d) = text("description")? {
        p.push("Notes", clean(&d, 600));
    }
    let extra: Vec<&str> = event
        .keys()
        .map(String::as_str)
        .filter(|k| {
            !matches!(
                *k,
                "summary"
                    | "start"
                    | "end"
                    | "location"
                    | "attendees"
                    | "recurrence"
                    | "description"
            )
        })
        .collect();
    if !extra.is_empty() {
        p.push("Also sets", extra.join(", "));
    }
    Ok(p)
}

fn query_value(query: Option<&str>, key: &str) -> Option<String> {
    url::form_urlencoded::parse(query?.as_bytes())
        .find(|(k, _)| k == key)
        .map(|(_, v)| v.into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn raw(message: &str) -> Vec<u8> {
        let enc = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(message);
        json!({"message": {"raw": enc}}).to_string().into_bytes()
    }

    fn field<'a>(p: &'a Preview, label: &str) -> Vec<&'a str> {
        p.fields
            .iter()
            .filter(|(l, _)| l == label)
            .map(|(_, v)| v.as_str())
            .collect()
    }

    #[test]
    fn a_plain_message_shows_who_gets_it_the_subject_and_the_text() {
        let p = render(
            GMAIL_MESSAGE,
            &raw("To: ana@example.com\r\nCc: ben@example.com\r\nSubject: Lunch?\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nAre you free at noon?"),
            None,
        )
        .unwrap();
        assert_eq!(field(&p, "To"), ["ana@example.com"]);
        assert_eq!(field(&p, "Cc"), ["ben@example.com"]);
        assert_eq!(field(&p, "Subject"), ["Lunch?"]);
        assert_eq!(field(&p, "Message"), ["Are you free at noon?"]);
    }

    #[test]
    fn the_top_level_raw_of_a_send_is_read_too() {
        let enc = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode("To: a@b.co\n\nhi");
        let body = json!({"raw": enc}).to_string();
        let p = render(GMAIL_MESSAGE, body.as_bytes(), None).unwrap();
        assert_eq!(field(&p, "To"), ["a@b.co"]);
    }

    #[test]
    fn hidden_recipients_replies_and_unusual_headers_are_shown_not_skipped() {
        let p = render(
            GMAIL_MESSAGE,
            &raw("To: a@b.co\nBcc: spy@evil.test\nReply-To: other@evil.test\nX-Track: 1\nSubject: s\n\nbody"),
            None,
        )
        .unwrap();
        assert_eq!(field(&p, "Bcc (hidden from the others)"), ["spy@evil.test"]);
        assert_eq!(field(&p, "Replies go to"), ["other@evil.test"]);
        assert_eq!(field(&p, "Other headers"), ["X-Track"]);
    }

    #[test]
    fn a_repeated_recipient_header_is_shown_every_time_and_folded_lines_are_joined() {
        let p = render(
            GMAIL_MESSAGE,
            &raw("To: a@b.co\nTo: sneaky@evil.test\nSubject: a very\n long subject\n\nx"),
            None,
        )
        .unwrap();
        assert_eq!(field(&p, "To"), ["a@b.co", "sneaky@evil.test"]);
        assert_eq!(field(&p, "Subject"), ["a very long subject"]);
    }

    #[test]
    fn encoded_words_are_decoded_so_the_person_reads_what_the_recipient_reads() {
        let subject = base64::engine::general_purpose::STANDARD.encode("Café ☕");
        let p = render(
            GMAIL_MESSAGE,
            &raw(&format!(
                "To: a@b.co\nSubject: =?UTF-8?B?{subject}?= today\n\nx"
            )),
            None,
        )
        .unwrap();
        assert_eq!(field(&p, "Subject"), ["Café ☕ today"]);
        let p = render(
            GMAIL_MESSAGE,
            &raw("To: a@b.co\nSubject: =?utf-8?Q?a_b=C3=A9?=\n\nx"),
            None,
        )
        .unwrap();
        assert_eq!(field(&p, "Subject"), ["a bé"]);
        let p = render(
            GMAIL_MESSAGE,
            &raw("To: a@b.co\nSubject: =?utf-8?Q?trunc=C3?=\n\nx"),
            None,
        )
        .unwrap();
        assert!(
            field(&p, "Subject")[0].contains("=?"),
            "a broken word is shown as written"
        );
    }

    #[test]
    fn what_cannot_be_shown_faithfully_is_refused() {
        for (why, msg) in [
            ("html", "To: a@b.co\nContent-Type: text/html\n\n<b>x</b>"),
            (
                "multipart",
                "To: a@b.co\nContent-Type: multipart/mixed; boundary=z\n\n--z\n",
            ),
            (
                "other charset",
                "To: a@b.co\nContent-Type: text/plain; charset=iso-8859-1\n\nx",
            ),
            (
                "base64 body",
                "To: a@b.co\nContent-Transfer-Encoding: base64\n\neA==",
            ),
            (
                "quoted-printable",
                "To: a@b.co\nContent-Transfer-Encoding: quoted-printable\n\nx=3D",
            ),
        ] {
            assert!(render(GMAIL_MESSAGE, &raw(msg), None).is_err(), "{why}");
        }
        assert!(render(GMAIL_MESSAGE, b"not json", None).is_err());
        assert!(
            render(GMAIL_MESSAGE, br#"{"id":"draft-1"}"#, None).is_err(),
            "a draft send has no message to show"
        );
        let big = raw(&format!("To: a@b.co\n\n{}", "x".repeat(MAX_MAIL_BYTES)));
        assert!(render(GMAIL_MESSAGE, &big, None).is_err());
        assert!(render("no-such-kind", b"{}", None).is_err());
    }

    #[test]
    fn hidden_and_direction_changing_characters_cannot_disguise_text() {
        let p = render(
            GMAIL_MESSAGE,
            &raw("To: a@b.co\nSubject: pay \u{202E}fdp.exe\u{200B}\n\nhel\u{0007}lo\u{FEFF}"),
            None,
        )
        .unwrap();
        assert_eq!(field(&p, "Subject"), ["pay fdp.exe"]);
        assert_eq!(field(&p, "Message"), ["hello"]);
    }

    #[test]
    fn a_long_message_is_cut_and_says_so() {
        let p = render(
            GMAIL_MESSAGE,
            &raw(&format!("To: a@b.co\n\n{}", "y".repeat(3000))),
            None,
        )
        .unwrap();
        let shown = field(&p, "Message")[0];
        assert_eq!(shown.chars().count(), MAX_TEXT_CHARS + 1);
        assert!(shown.ends_with('…'));
        assert!(field(&p, "Length")[0].starts_with("3000 characters"));
    }

    #[test]
    fn a_message_with_no_recipient_says_so() {
        let p = render(GMAIL_MESSAGE, &raw("Subject: draft\n\nnotes to self"), None).unwrap();
        assert_eq!(field(&p, "To"), ["(no recipient)"]);
    }

    fn event(v: Value) -> Vec<u8> {
        v.to_string().into_bytes()
    }

    #[test]
    fn an_event_shows_when_where_and_who_is_invited_and_whether_they_are_emailed() {
        let body = event(json!({
            "summary": "Dinner", "location": "Home",
            "start": {"dateTime": "2026-10-01T19:00:00", "timeZone": "Europe/Berlin"},
            "end": {"dateTime": "2026-10-01T21:00:00", "timeZone": "Europe/Berlin"},
            "attendees": [{"email": "ana@example.com"}, {"email": "ben@example.com"}],
            "description": "Bring wine"
        }));
        let p = render(CALENDAR_EVENT, &body, Some("sendUpdates=all")).unwrap();
        assert_eq!(field(&p, "Title"), ["Dinner"]);
        assert_eq!(field(&p, "Starts"), ["2026-10-01T19:00:00 Europe/Berlin"]);
        assert_eq!(field(&p, "Guests"), ["ana@example.com, ben@example.com"]);
        assert_eq!(field(&p, "Guests are emailed"), ["yes, all of them"]);
        assert_eq!(field(&p, "Notes"), ["Bring wine"]);
        let quiet = render(CALENDAR_EVENT, &body, None).unwrap();
        assert_eq!(field(&quiet, "Guests are emailed"), ["no"]);
    }

    #[test]
    fn an_event_shows_repeats_all_day_and_fields_it_does_not_render() {
        let body = event(json!({
            "start": {"date": "2026-10-01"}, "end": {"date": "2026-10-02"},
            "recurrence": ["RRULE:FREQ=WEEKLY"], "conferenceData": {"createRequest": {}}
        }));
        let p = render(CALENDAR_EVENT, &body, None).unwrap();
        assert_eq!(field(&p, "Title"), ["(no title)"]);
        assert_eq!(field(&p, "Starts"), ["2026-10-01 (all day)"]);
        assert!(field(&p, "Repeats")[0].contains("WEEKLY"));
        assert_eq!(field(&p, "Also sets"), ["conferenceData"]);
    }

    #[test]
    fn a_malformed_event_is_refused() {
        for body in [
            json!({"summary": "x"}),
            json!({"summary": 5, "start": {"date": "d"}, "end": {"date": "d"}}),
            json!({"start": {"date": "d"}, "end": {"date": "d"}, "attendees": "a@b.co"}),
            json!({"start": {"date": "d"}, "end": {"date": "d"}, "attendees": [{"name": "x"}]}),
            json!([1, 2]),
        ] {
            assert!(
                render(CALENDAR_EVENT, &event(body.clone()), None).is_err(),
                "{body}"
            );
        }
    }

    #[test]
    fn the_digest_follows_the_rendering() {
        let a = render(GMAIL_MESSAGE, &raw("To: a@b.co\n\nhi"), None).unwrap();
        let same = render(GMAIL_MESSAGE, &raw("To: a@b.co\n\nhi"), None).unwrap();
        let other = render(GMAIL_MESSAGE, &raw("To: c@d.co\n\nhi"), None).unwrap();
        assert_eq!(a.sha256(), same.sha256());
        assert_ne!(a.sha256(), other.sha256());
        assert_eq!(a.sha256().len(), 64);
    }
}
