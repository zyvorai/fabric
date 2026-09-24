// Copyright 2026 Zyvor AI Labs · https://zyvor.dev
// SPDX-License-Identifier: Apache-2.0

//! Inner containment: run the worker (and any browser it launches) as an
//! unprivileged user in a bubblewrap container inside the sandbox VM.
//!
//! The launcher is shipped with the runtime and written into the guest at
//! provisioning, so the template only needs `bubblewrap` and `util-linux`
//! (`setpriv`). It fails closed if either is missing.

/// Guest path the launcher is written to.
pub const GUEST_PATH: &str = "/opt/zyvor/contain.sh";

pub const SCRIPT: &str = include_str!("../guest/contain.sh");

/// What goes in front of `node` in the guest command line: the launcher when
/// strict, nothing otherwise. Includes the trailing space.
pub fn launcher_prefix(mode: crate::model::InnerContainer) -> String {
    match mode {
        crate::model::InnerContainer::Strict => format!("{GUEST_PATH} "),
        crate::model::InnerContainer::Off => String::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn launcher_prefix_wraps_only_when_strict() {
        use crate::model::InnerContainer;
        assert_eq!(launcher_prefix(InnerContainer::Off), "");
        assert_eq!(
            launcher_prefix(InnerContainer::Strict),
            "/opt/zyvor/contain.sh "
        );
    }
    use std::{fs, os::unix::fs::PermissionsExt, path::Path, process::Command};

    fn write_exe(dir: &Path, name: &str, body: &str) {
        let path = dir.join(name);
        fs::write(&path, format!("#!/bin/sh\n{body}\n")).unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o755)).unwrap();
    }

    /// Run the script with fake `bwrap`/`setpriv` that record their arguments.
    fn run(fake_setpriv: bool, fake_bwrap: bool, args: &[&str]) -> (i32, String, String) {
        let dir = std::env::temp_dir().join(format!("zyvor-contain-{}", uuid::Uuid::new_v4()));
        let bin = dir.join("bin");
        fs::create_dir_all(&bin).unwrap();
        let script = dir.join("contain.sh");
        fs::write(&script, SCRIPT).unwrap();
        let log = dir.join("bwrap.args");
        if fake_bwrap {
            write_exe(
                &bin,
                "bwrap",
                &format!("printf '%s\\n' \"$@\" > {}", log.display()),
            );
        }
        if fake_setpriv {
            write_exe(&bin, "setpriv", "exit 0");
        }
        let path = format!("{}:/usr/bin:/bin", bin.display());
        let output = Command::new("sh")
            .arg(&script)
            .args(args)
            .env("PATH", path)
            .env("ZYVOR_CONTAIN_USER", "nobody")
            .env("ZYVOR_CONTAIN_HOME", dir.join("home"))
            .output()
            .unwrap();
        let recorded = fs::read_to_string(&log).unwrap_or_default();
        let stderr = String::from_utf8_lossy(&output.stderr).into_owned();
        let _ = fs::remove_dir_all(&dir);
        (output.status.code().unwrap_or(-1), recorded, stderr)
    }

    #[test]
    fn runs_the_command_unprivileged_in_a_read_only_container() {
        let (code, args, stderr) = run(true, true, &["node", "/opt/zyvor/worker.mjs"]);
        assert_eq!(code, 0, "{stderr}");
        let lines: Vec<&str> = args.lines().collect();
        let has = |flag: &str| lines.contains(&flag);
        for flag in [
            "--die-with-parent",
            "--new-session",
            "--unshare-pid",
            "--unshare-ipc",
            "--ro-bind",
        ] {
            assert!(has(flag), "missing {flag} in {lines:?}");
        }
        // Read-only root, private tmp, no leftover root data.
        let pos = lines.iter().position(|l| *l == "--ro-bind").unwrap();
        assert_eq!(&lines[pos + 1..pos + 3], ["/", "/"]);
        assert!(lines.windows(2).any(|w| w == ["--tmpfs", "/tmp"]));
        assert!(lines.windows(2).any(|w| w == ["--tmpfs", "/root"]));
        // Privileges are dropped inside, then the command runs.
        let tail: Vec<&str> = lines
            .iter()
            .copied()
            .skip_while(|l| *l != "setpriv")
            .collect();
        for flag in [
            "--clear-groups",
            "--inh-caps=-all",
            "--bounding-set=-all",
            "--no-new-privs",
        ] {
            assert!(tail.contains(&flag), "missing {flag} in {tail:?}");
        }
        assert!(tail.iter().any(|l| l.starts_with("--reuid=")));
        assert_eq!(&tail[tail.len() - 2..], ["node", "/opt/zyvor/worker.mjs"]);
        // Network is shared on purpose, never unshared.
        assert!(!has("--unshare-net") && !has("--unshare-all"));
    }

    #[test]
    fn fails_closed_without_bubblewrap() {
        let (code, args, stderr) = run(true, false, &["true"]);
        assert_eq!(code, 127);
        assert!(stderr.contains("bwrap is required"), "{stderr}");
        assert!(args.is_empty());
    }

    #[test]
    fn fails_closed_without_setpriv() {
        let (code, _, stderr) = run(false, true, &["true"]);
        assert_eq!(code, 127);
        assert!(stderr.contains("setpriv is required"), "{stderr}");
    }

    #[test]
    fn refuses_to_run_with_no_command() {
        let (code, _, stderr) = run(true, true, &[]);
        assert_eq!(code, 64);
        assert!(stderr.contains("no command"), "{stderr}");
    }

    #[test]
    fn script_is_shell_syntax_clean() {
        let status = Command::new("sh")
            .arg("-n")
            .arg(concat!(env!("CARGO_MANIFEST_DIR"), "/guest/contain.sh"))
            .status()
            .unwrap();
        assert!(status.success());
    }
}
