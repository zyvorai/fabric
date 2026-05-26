#!/usr/bin/env python3
# Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.
# Proprietary software — see LICENSE in the repository root.
# https://zyvor.dev · info@zyvor.dev

"""Apply Zyvor proprietary license metadata and source headers across tt/ repos."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

REPOS = [
    "Aether",
    "cockpit",
    "forge",
    "hyper2kvm-",
    "hypercluster",
    "hypersdk-",
    "hypersdk-web",
    "IronWolf",
    "machina",
    "mkosi-kernel",
    "nightforge",
    "packetwolf",
    "ragnarok",
    "v9s",
    "VMRogue",
    "vmspawn",
]

SKIP_REPO = {"guestkit"}

CARGO_LICENSE = 'LicenseRef-Zyvor-Proprietary'
NPM_LICENSE = "SEE LICENSE IN LICENSE"
PY_LICENSE = "Proprietary"

SKIP_DIR_NAMES = {
    ".git",
    "node_modules",
    "target",
    "vendor",
    "dist",
    "build",
    ".next",
    ".vite",
    "coverage",
    "__pycache__",
    ".pytest_cache",
    "docs/legal",
}

SKIP_FILE_PARTS = {
    ".min.js",
    ".min.css",
    ".d.ts.map",
    ".js.map",
}

HEADER_MARK = "ZyvorAI Labs Private Limited"
CONTACT_MARK = "info@zyvor.dev"

HEADERS = {
    ".rs": (
        "// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "// Proprietary software — see LICENSE in the repository root.\n"
        "// https://zyvor.dev · info@zyvor.dev\n\n"
    ),
    ".go": (
        "// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "// Proprietary software — see LICENSE in the repository root.\n"
        "// https://zyvor.dev · info@zyvor.dev\n\n"
    ),
    ".py": (
        "# Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "# Proprietary software — see LICENSE in the repository root.\n"
        "# https://zyvor.dev · info@zyvor.dev\n\n"
    ),
    ".ts": (
        "// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "// Proprietary software — see LICENSE in the repository root.\n"
        "// https://zyvor.dev · info@zyvor.dev\n\n"
    ),
    ".tsx": (
        "// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "// Proprietary software — see LICENSE in the repository root.\n"
        "// https://zyvor.dev · info@zyvor.dev\n\n"
    ),
    ".js": (
        "// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "// Proprietary software — see LICENSE in the repository root.\n"
        "// https://zyvor.dev · info@zyvor.dev\n\n"
    ),
    ".jsx": (
        "// Copyright (c) 2026 ZyvorAI Labs Private Limited. All rights reserved.\n"
        "// Proprietary software — see LICENSE in the repository root.\n"
        "// https://zyvor.dev · info@zyvor.dev\n\n"
    ),
}

SOURCE_EXTS = set(HEADERS.keys())

LICENSE_LINE = re.compile(r'^license\s*=\s*["\'][^"\']+["\']\s*$', re.MULTILINE)
LICENSE_WORKSPACE = re.compile(r'^license\.workspace\s*=\s*true\s*$', re.MULTILINE)
PACKAGE_JSON_LICENSE = re.compile(r'"license"\s*:\s*"[^"]*"')
PYPROJECT_LICENSE_STR = re.compile(r'^license\s*=\s*["\'][^"\']+["\']\s*$', re.MULTILINE)
PYPROJECT_LICENSE_TEXT = re.compile(
    r'^license\s*=\s*\{text\s*=\s*["\'][^"\']+["\']\}\s*$', re.MULTILINE
)

README_PROPRIETARY = (
    "\n## License\n\n"
    "**Proprietary — ZyvorAI Labs Private Limited** ([zyvor.dev](https://zyvor.dev)). "
    "All rights reserved. See [LICENSE](LICENSE). "
    "Contact: [info@zyvor.dev](mailto:info@zyvor.dev). "
    "No redistribution without written permission.\n"
)


def should_skip_path(path: Path) -> bool:
    parts = set(path.parts)
    if parts & SKIP_DIR_NAMES:
        return True
    name = path.name
    for part in SKIP_FILE_PARTS:
        if name.endswith(part):
            return True
    return False


def update_cargo_toml(path: Path, stats: dict) -> None:
    text = path.read_text(encoding="utf-8")
    original = text

    if LICENSE_WORKSPACE.search(text):
        return

    if LICENSE_LINE.search(text):
        text = LICENSE_LINE.sub(f'license = "{CARGO_LICENSE}"', text, count=1)
    elif "[package]" in text and "license" not in text:
        text = text.replace("[package]\n", f'[package]\nlicense = "{CARGO_LICENSE}"\n', 1)

    if text != original:
        path.write_text(text, encoding="utf-8")
        stats["cargo"] += 1


def update_workspace_cargo(path: Path, stats: dict) -> None:
    text = path.read_text(encoding="utf-8")
    if "[workspace]" not in text or "members" not in text:
        return
    original = text
    if "[workspace.package]" in text:
        if re.search(r'^license\s*=', text, re.MULTILINE):
            text = LICENSE_LINE.sub(f'license = "{CARGO_LICENSE}"', text, count=1)
        else:
            text = text.replace(
                "[workspace.package]\n",
                f'[workspace.package]\nlicense = "{CARGO_LICENSE}"\n',
                1,
            )
    else:
        # Insert after [workspace] header block (before first [section] or deps)
        m = re.search(r"(\[workspace\][^\[]*)", text, re.DOTALL)
        if m:
            insert = f'\n[workspace.package]\nlicense = "{CARGO_LICENSE}"\n'
            text = text[: m.end()] + insert + text[m.end() :]

    if text != original:
        path.write_text(text, encoding="utf-8")
        stats["cargo_workspace"] += 1


def update_package_json(path: Path, stats: dict) -> None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return
    if data.get("license") == NPM_LICENSE:
        return
    data["license"] = NPM_LICENSE
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    stats["npm"] += 1


def update_pyproject(path: Path, stats: dict) -> None:
    text = path.read_text(encoding="utf-8")
    original = text
    if PYPROJECT_LICENSE_TEXT.search(text):
        text = PYPROJECT_LICENSE_TEXT.sub(
            f'license = {{text = "{PY_LICENSE}"}}', text, count=1
        )
    elif PYPROJECT_LICENSE_STR.search(text):
        text = PYPROJECT_LICENSE_STR.sub(f'license = "{PY_LICENSE}"', text, count=1)
    elif "[project]" in text and "license" not in text:
        text = text.replace("[project]\n", f'[project]\nlicense = "{PY_LICENSE}"\n', 1)
    if text != original:
        path.write_text(text, encoding="utf-8")
        stats["pyproject"] += 1


def is_generated_source(text: str) -> bool:
    head = text[:500].lower()
    return any(
        x in head
        for x in (
            "automatically generated",
            "do not edit",
            "code generated by",
            "generated file",
            "@generated",
        )
    )


def insert_rust_header(text: str, header: str) -> str:
    lines = text.splitlines(keepends=True)
    idx = 0
    if lines and lines[0].startswith("#!"):
        idx = 1
    while idx < len(lines) and lines[idx].strip().startswith("#!["):
        idx += 1
    return "".join(lines[:idx]) + header + "".join(lines[idx:])


def insert_shebang_header(text: str, header: str) -> str:
    if text.startswith("#!"):
        first_nl = text.find("\n")
        if first_nl == -1:
            return text + "\n" + header
        return text[: first_nl + 1] + header + text[first_nl + 1 :]
    return header + text


def ensure_contact_line(text: str, ext: str) -> str:
    if CONTACT_MARK in text[:600]:
        return text
    if HEADER_MARK not in text[:600]:
        return text
    comment = "//" if ext != ".py" else "#"
    contact = f"{comment} https://zyvor.dev · info@zyvor.dev\n"
    marker = "see LICENSE in the repository root.\n"
    if marker in text:
        return text.replace(marker, marker + contact, 1)
    return text


def add_source_header(path: Path, stats: dict) -> None:
    ext = path.suffix
    if ext not in SOURCE_EXTS:
        return
    try:
        text = path.read_text(encoding="utf-8")
    except (UnicodeDecodeError, OSError):
        return
    if HEADER_MARK in text[:400] and CONTACT_MARK in text[:600]:
        return
    if HEADER_MARK in text[:400]:
        new_text = ensure_contact_line(text, ext)
        if new_text != text:
            path.write_text(new_text, encoding="utf-8")
            stats["headers"] += 1
        return
    if is_generated_source(text):
        return

    header = HEADERS[ext]
    if ext == ".rs":
        new_text = insert_rust_header(text, header)
    elif ext == ".py":
        new_text = insert_shebang_header(text, header)
    else:
        new_text = header + text

    if new_text != text:
        path.write_text(new_text, encoding="utf-8")
        stats["headers"] += 1


def update_readme(path: Path, stats: dict) -> None:
    text = path.read_text(encoding="utf-8")
    if HEADER_MARK in text and "Proprietary" in text and "[LICENSE](LICENSE)" in text:
        return
    lower = text.lower()
    if "apache license" in lower or "licensed under the apache" in lower:
        # Replace trailing license boilerplate if present
        text = re.sub(
            r"\nLicensed under the Apache License.*?See \[LICENSE\]\(LICENSE\).*?\n",
            README_PROPRIETARY,
            text,
            flags=re.DOTALL | re.IGNORECASE,
            count=1,
        )
        text = re.sub(
            r"\nApache License 2\.0.*?See \[LICENSE\]\(LICENSE\).*?\n",
            README_PROPRIETARY,
            text,
            flags=re.DOTALL | re.IGNORECASE,
            count=1,
        )
        text = re.sub(
            r"\nThis project is licensed under MIT OR Apache-2\.0\.\s*\n",
            README_PROPRIETARY,
            text,
            flags=re.IGNORECASE,
            count=1,
        )
        stats["readme"] += 1
    elif "## License" not in text and "license" in lower:
        text = text.rstrip() + README_PROPRIETARY
        stats["readme"] += 1
    elif "## License" not in text:
        text = text.rstrip() + README_PROPRIETARY
        stats["readme"] += 1
    else:
        return
    path.write_text(text, encoding="utf-8")


def process_repo(repo_root: Path) -> dict:
    stats = {
        "cargo": 0,
        "cargo_workspace": 0,
        "npm": 0,
        "pyproject": 0,
        "headers": 0,
        "readme": 0,
    }

    root_cargo = repo_root / "Cargo.toml"
    if root_cargo.is_file():
        update_workspace_cargo(root_cargo, stats)

    for cargo in repo_root.rglob("Cargo.toml"):
        if should_skip_path(cargo):
            continue
        update_cargo_toml(cargo, stats)

    for pkg in repo_root.rglob("package.json"):
        if should_skip_path(pkg):
            continue
        if "node_modules" in pkg.parts:
            continue
        update_package_json(pkg, stats)

    for pyproject in repo_root.rglob("pyproject.toml"):
        if should_skip_path(pyproject):
            continue
        update_pyproject(pyproject, stats)

    for src in repo_root.rglob("*"):
        if not src.is_file() or should_skip_path(src):
            continue
        if src.suffix in SOURCE_EXTS:
            add_source_header(src, stats)

    readme = repo_root / "README.md"
    if readme.is_file():
        update_readme(readme, stats)

    return stats


def canonical_root() -> Path:
    script = Path(__file__).resolve()
    parent = script.parents[2]  # tt/
    packetwolf = parent / "packetwolf"
    if (packetwolf / "LICENSE").is_file():
        return packetwolf
    return script.parents[1]


def main() -> int:
    root = canonical_root()
    parent = root.parent
    print(f"Parent: {parent}")
    print(f"Excluded: {', '.join(sorted(SKIP_REPO))}")
    print("")

    totals = {
        "cargo": 0,
        "cargo_workspace": 0,
        "npm": 0,
        "pyproject": 0,
        "headers": 0,
        "readme": 0,
    }

    for name in REPOS:
        repo = parent / name
        if not repo.is_dir():
            print(f"skip {name} (missing)")
            continue
        stats = process_repo(repo)
        print(
            f"{name}: cargo={stats['cargo']} workspace={stats['cargo_workspace']} "
            f"npm={stats['npm']} py={stats['pyproject']} headers={stats['headers']} "
            f"readme={stats['readme']}"
        )
        for k in totals:
            totals[k] += stats[k]

    print("")
    print(
        "Totals: "
        + ", ".join(f"{k}={v}" for k, v in totals.items())
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
