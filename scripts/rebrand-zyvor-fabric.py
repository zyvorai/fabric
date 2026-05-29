#!/usr/bin/env python3
"""Rebrand user-facing vmspawn/vmspawnd prose to Zyvor Fabric while preserving technical identifiers."""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

DOC_GLOBS = [
    "docs/**/*.md",
    "docs/**/*.html",
    "README.md",
    "QUICKSTART.md",
    "FEATURES.md",
    "CONTRIBUTING.md",
    "ansible/README.md",
    "operator/README.md",
    "terraform-provider/README.md",
    "web/src/components/ZyvorAbout.tsx",
]

PROTECTED = [
    "systemd-vmspawn(1)",
    "systemd-vmspawn",
    "vmspawn-driver",
    "vmspawn-sdk",
    "vmspawnctl",
    "vmspawnd-operator",
    "vmspawnd-cleanup",
    "vmspawnd-backup",
    "vmspawnd.socket",
    "vmspawnd.service",
    "vmspawnd.toml",
    "vmspawnd.env",
    "vmspawnd.conf",
    "vmspawnd.spec",
    "vmspawnd.local",
    "vmspawnd_token",
    "vmspawnd-saved-login",
    "vmspawnd_username",
    "vmspawnd-theme",
    "vmspawnd-recent-pages",
    "vmspawnd-pinned-pages",
    "vmspawnd_migration_templates",
    "vmspawnd_favorites",
    "vmspawnd_datacenter",
    "vmspawnd_vm",
    "/etc/vmspawnd/",
    "/var/lib/vmspawnd/",
    "/usr/lib/vmspawnd",
    "/run/vmspawnd",
    "VMSPAWND_",
    "cargo run --bin vmspawnd",
    "cargo build --bin vmspawnd",
    "--bin vmspawnd",
    "journalctl -u vmspawnd",
    "systemctl enable --now vmspawnd",
    "systemctl start vmspawnd",
    "systemctl stop vmspawnd",
    "systemctl restart vmspawnd",
    "systemctl status vmspawnd",
    "systemctl enable vmspawnd",
    "systemctl disable vmspawnd",
    "pam.d/vmspawnd",
    "configs/pam.d/vmspawnd",
    "plugins/modules/vmspawnd_",
    "vmspawnd-01",
    "vmspawnd nft",
]


def stash_technical(text: str) -> tuple[str, list[str]]:
    slots: list[str] = []

    def put(value: str) -> str:
        slots.append(value)
        return f"\x00S{len(slots) - 1:04d}\x00"

    parts = re.split(r"(```[\s\S]*?```|`[^`\n]+`)", text)
    for i in range(0, len(parts), 2):
        chunk = parts[i]
        for pat in PROTECTED:
            while pat in chunk:
                chunk = chunk.replace(pat, put(pat), 1)
        parts[i] = chunk
    return "".join(parts), slots


def restore_technical(text: str, slots: list[str]) -> str:
    for i, val in enumerate(slots):
        text = text.replace(f"\x00S{i:04d}\x00", val)
    return text


def apply_rebrand(text: str) -> str:
    text = text.replace("github.com/ssahani/vmspawn", "github.com/ssahani/zyvor-fabric")
    text = text.replace("ssahani/vmspawn", "ssahani/zyvor-fabric")

    text, slots = stash_technical(text)

    text = re.sub(r"\bvmspawn\b(?!ctl|-driver|-sdk)", "Zyvor Fabric", text)
    text = re.sub(
        r"\bvmspawnd\b(?!\s*(?:daemon|service|socket|\.toml|\.env|operator|nft|local|_|-01))",
        "Zyvor Fabric",
        text,
    )

    text = restore_technical(text, slots)

    text = text.replace("Zyvor Fabric Fabric", "Zyvor Fabric")
    text = text.replace("Zyvor Zyvor", "Zyvor")
    return text


def process_file(path: Path) -> bool:
    original = path.read_text(encoding="utf-8")
    updated = apply_rebrand(original)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def main() -> int:
    changed = 0
    seen: set[Path] = set()
    for pattern in DOC_GLOBS:
        for path in ROOT.glob(pattern):
            if not path.is_file() or path in seen:
                continue
            seen.add(path)
            if process_file(path):
                print(f"updated: {path.relative_to(ROOT)}")
                changed += 1
    print(f"Done. {changed} file(s) updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
