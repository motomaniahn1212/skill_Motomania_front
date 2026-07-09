#!/usr/bin/env python3
"""Static Motomania UI contract audit.

This tool is intentionally conservative: it flags code that usually creates
frontend drift so Codex inspects it before accepting a UI change.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import subprocess
import sys
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Iterable


SEVERITY_RANK = {"P1": 1, "P2": 2, "P3": 3}
DEFAULT_GLOBS = (
    "templates/**/*.html",
    "static/**/*.css",
    "static/**/*.js",
)
EXCLUDED_PARTS = {
    ".git",
    ".mypy_cache",
    ".pytest_cache",
    "__pycache__",
    "instance",
    "node_modules",
    "venv",
}
ALLOWED_COLORS = {
    "#e31111",
    "#E31111",
    "#f4f4f5",
    "#166534",
    "#1d4ed8",
    "#92400e",
    "#b91c1c",
    "#111827",
    "#ffffff",
    "#fff",
}
TECHNICAL_TERMS = ("RMS", "SQL", "JSON", "API", "logs", "Batch", "ITL", "endpoint", "stack trace")


@dataclass
class Finding:
    severity: str
    code: str
    file: str
    line: int
    message: str
    excerpt: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Audit Motomania static UI contract drift.")
    parser.add_argument("--root", default=".", help="MotomaniaWeb root. Default: current directory.")
    parser.add_argument("--out", default="instance/validation/static-ui-contract", help="Output directory.")
    parser.add_argument("--path", action="append", default=[], help="Specific file or directory to scan. Can repeat.")
    parser.add_argument("--changed-only", action="store_true", help="Scan git changed files only.")
    parser.add_argument("--fail-on", choices=("P1", "P2", "P3", "none"), default="P1")
    return parser.parse_args()


def is_excluded(path: Path) -> bool:
    return any(part in EXCLUDED_PARTS for part in path.parts)


def iter_default_files(root: Path) -> Iterable[Path]:
    for pattern in DEFAULT_GLOBS:
        for path in root.glob(pattern):
            if path.is_file() and not is_excluded(path):
                yield path


def iter_path_files(root: Path, paths: list[str]) -> Iterable[Path]:
    for raw in paths:
        path = Path(raw)
        if not path.is_absolute():
            path = root / path
        if path.is_dir():
            for child in path.rglob("*"):
                if child.is_file() and child.suffix.lower() in {".html", ".css", ".js"} and not is_excluded(child):
                    yield child
        elif path.is_file() and path.suffix.lower() in {".html", ".css", ".js"} and not is_excluded(path):
            yield path


def iter_changed_files(root: Path) -> Iterable[Path]:
    proc = subprocess.run(
        ["git", "diff", "--name-only", "--cached", "--"],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    staged = proc.stdout.splitlines() if proc.returncode == 0 else []
    proc = subprocess.run(
        ["git", "diff", "--name-only", "--"],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    unstaged = proc.stdout.splitlines() if proc.returncode == 0 else []
    for rel in sorted(set(staged + unstaged)):
        path = root / rel
        if path.is_file() and path.suffix.lower() in {".html", ".css", ".js"} and not is_excluded(path):
            yield path


def read_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return path.read_text(encoding="latin-1")


def rel(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        return str(path).replace("\\", "/")


def add(findings: list[Finding], severity: str, code: str, path: Path, root: Path, line: int, message: str, excerpt: str) -> None:
    findings.append(Finding(severity, code, rel(path, root), line, message, excerpt.strip()[:220]))


def strip_jinja(line: str) -> str:
    line = re.sub(r"{#.*?#}", "", line)
    line = re.sub(r"{%.*?%}", "", line)
    line = re.sub(r"{{.*?}}", "", line)
    return line


def audit_file(path: Path, root: Path) -> list[Finding]:
    text = read_text(path)
    lines = text.splitlines()
    findings: list[Finding] = []
    relative = rel(path, root)
    lower_relative = relative.lower()
    suffix = path.suffix.lower()
    if lower_relative.endswith("assets/grid-overlay.css"):
        return findings

    in_script = False
    in_style = False
    for idx, line in enumerate(lines, start=1):
        clean = strip_jinja(line)
        lowered = clean.lower()
        if "<script" in lowered:
            in_script = True
        if "</script" in lowered:
            in_script = False
            continue
        if "<style" in lowered:
            in_style = True
        if "</style" in lowered:
            in_style = False
            continue

        if suffix == ".html" and re.search(r"\bstyle\s*=", clean, flags=re.I):
            add(findings, "P2", "inline-style", path, root, idx, "Inline styles create one-off UI drift", line)

        if suffix == ".html" and not in_script and not in_style:
            for term in TECHNICAL_TERMS:
                if re.search(rf"\b{re.escape(term)}\b", clean):
                    add(findings, "P3", "visible-technical-term", path, root, idx, f"Possible operator-visible technical term: {term}", line)
                    break

        if "templates/base.html" not in lower_relative and re.search(r"\b(top|top-user|top-module|theme-toggle|mod-menu)\b", clean):
            if re.search(r"class=|\.top\b|\.top-user\b|\.top-module\b|\.theme-toggle\b|\.mod-menu\b", clean):
                add(findings, "P1", "global-shell-redefinition", path, root, idx, "Child UI appears to redefine global shell/header controls", line)

        if re.search(r"class=[\"'][^\"']*(?:fin-sidebar|local-sidebar|module-sidebar)[^\"']*[\"']", clean, flags=re.I):
            add(findings, "P2", "custom-sidebar-markup", path, root, idx, "Module introduces its own sidebar markup; prefer the shared module group sidebar", line)

        if "linear-gradient" in lowered:
            add(findings, "P2", "local-gradient", path, root, idx, "Operational UI should not add decorative gradients", line)

        if re.search(r"letter-spacing\s*:\s*-\d", clean, flags=re.I):
            add(findings, "P2", "negative-letter-spacing", path, root, idx, "Letter spacing must not be negative", line)

        if re.search(r"font-size\s*:[^;]*(?:vw|vh|vmin|vmax)", clean, flags=re.I):
            add(findings, "P2", "viewport-font-size", path, root, idx, "Font size must not scale with viewport units", line)

        radius = re.search(r"border-radius\s*:\s*(\d+(?:\.\d+)?)px", clean, flags=re.I)
        if radius and float(radius.group(1)) > 8:
            add(findings, "P3", "large-radius", path, root, idx, "Cards and controls should stay at 8px radius or less unless existing system requires it", line)

        if re.search(r"(?:button|btn|cf-btn)[^{;\n]*(?:height|min-height)\s*:\s*(\d+(?:\.\d+)?)px", clean, flags=re.I):
            height = float(re.search(r"(\d+(?:\.\d+)?)px", clean).group(1))
            if height not in (36.0, 44.0):
                add(findings, "P2", "nonstandard-button-height", path, root, idx, "Buttons should use stable 36px desktop or 44px mobile heights", line)

        if re.search(r"(?:input|select|textarea|field|control|textbox|precio|price|monto|amount)[^{;\n]*(?:width|min-width)\s*:\s*(\d+(?:\.\d+)?)px", clean, flags=re.I):
            width = float(re.search(r"(\d+(?:\.\d+)?)px", clean).group(1))
            if width > 360:
                add(findings, "P2", "oversized-control-width-css", path, root, idx, "CSS gives a form control more width than most operational values need", line)

        if re.search(r"(?:table|grid|list|tbody|items|productos|products)[^{;\n]*(?:height|min-height)\s*:\s*(\d+(?:\.\d+)?)px", clean, flags=re.I):
            height = float(re.search(r"(\d+(?:\.\d+)?)px", clean).group(1))
            if height > 720:
                add(findings, "P2", "oversized-grid-height-css", path, root, idx, "Grid/list height looks page-sized; prefer an internal viewport around 10 visible rows", line)

        if re.search(r"(?:overflow-x\s*:\s*scroll|overflow\s*:\s*auto)", clean, flags=re.I):
            add(findings, "P3", "explicit-scroll-css", path, root, idx, "Explicit scroll needs runtime validation so it is not avoidable horizontal scroll", line)

        if re.search(r"(?:\.sidebar|fin-sidebar|module-sidebar)[^{;\n]*(?:background|width|color)\s*:", clean, flags=re.I):
            if "module-group-sidebar" not in clean:
                add(findings, "P2", "sidebar-style-drift", path, root, idx, "Local sidebar styles often drift from the shared shell", line)

        for match in re.finditer(r"#[0-9a-fA-F]{3,8}\b", clean):
            color = match.group(0)
            if color not in ALLOWED_COLORS and not lower_relative.endswith("base.html"):
                add(findings, "P3", "hardcoded-color", path, root, idx, f"Hardcoded color outside the shared token set: {color}", line)
                break

    return findings


def write_markdown(out_path: Path, findings: list[Finding]) -> None:
    lines = ["# Static UI Contract Audit", ""]
    counts = {severity: sum(1 for f in findings if f.severity == severity) for severity in ("P1", "P2", "P3")}
    lines.append(f"Findings: P1={counts['P1']}, P2={counts['P2']}, P3={counts['P3']}")
    lines.append("")
    if not findings:
        lines.append("No findings.")
    for item in findings:
        lines.append(f"- {item.severity} {item.code} {item.file}:{item.line} - {item.message}")
        lines.append(f"  `{item.excerpt}`")
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_html(out_path: Path, findings: list[Finding]) -> None:
    rows = []
    for item in findings:
        rows.append(
            "<tr>"
            f"<td><span class='sev {html.escape(item.severity)}'>{html.escape(item.severity)}</span></td>"
            f"<td>{html.escape(item.code)}</td>"
            f"<td>{html.escape(item.file)}:{item.line}</td>"
            f"<td>{html.escape(item.message)}</td>"
            f"<td><code>{html.escape(item.excerpt)}</code></td>"
            "</tr>"
        )
    if not rows:
        rows.append("<tr><td colspan='5'>No findings.</td></tr>")
    out_path.write_text(
        """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Static UI Contract Audit</title>
<style>
body{font-family:Inter,Arial,sans-serif;margin:24px;background:#f4f4f5;color:#111827}
table{border-collapse:collapse;width:100%;background:white}
th,td{border-bottom:1px solid #e4e4e7;font-size:12px;padding:8px;text-align:left;vertical-align:top}
th{background:#fafafa;font-size:11px;text-transform:uppercase}
code{white-space:pre-wrap}
.sev{border-radius:4px;color:white;display:inline-block;font-size:11px;font-weight:700;min-width:28px;padding:3px 5px;text-align:center}
.P1{background:#b91c1c}.P2{background:#92400e}.P3{background:#1d4ed8}
</style>
</head>
<body>
<h1>Static UI Contract Audit</h1>
<table>
<thead><tr><th>Severity</th><th>Code</th><th>Location</th><th>Message</th><th>Excerpt</th></tr></thead>
<tbody>
"""
        + "\n".join(rows)
        + """
</tbody>
</table>
</body>
</html>
""",
        encoding="utf-8",
    )


def main() -> int:
    args = parse_args()
    root = Path(args.root).resolve()
    out_dir = Path(args.out)
    if not out_dir.is_absolute():
        out_dir = root / out_dir
    out_dir.mkdir(parents=True, exist_ok=True)

    if args.changed_only:
        files = list(iter_changed_files(root))
    elif args.path:
        files = list(iter_path_files(root, args.path))
    else:
        files = list(iter_default_files(root))
    files = sorted(set(files))

    findings: list[Finding] = []
    for file_path in files:
        findings.extend(audit_file(file_path, root))

    payload = {
        "root": str(root),
        "files": [rel(path, root) for path in files],
        "findings": [asdict(item) for item in findings],
        "counts": {severity: sum(1 for f in findings if f.severity == severity) for severity in ("P1", "P2", "P3")},
    }
    (out_dir / "static-ui-contract.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    write_markdown(out_dir / "summary.md", findings)
    write_html(out_dir / "static-ui-contract.html", findings)

    print(json.dumps({"outDir": str(out_dir), "files": len(files), "counts": payload["counts"]}, indent=2))
    if args.fail_on != "none":
        threshold = SEVERITY_RANK[args.fail_on]
        if any(SEVERITY_RANK[item.severity] <= threshold for item in findings):
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
