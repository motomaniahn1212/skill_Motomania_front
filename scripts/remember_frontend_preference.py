#!/usr/bin/env python3
"""Append an owner-approved frontend placement rule to the skill memory."""

from __future__ import annotations

import argparse
import hashlib
import re
import sys
from datetime import datetime
from pathlib import Path


VALID_CATEGORIES = (
    "alignment",
    "buttons",
    "tabs",
    "inputs",
    "grids",
    "scroll",
    "cards",
    "hierarchy",
    "copy",
    "visual-system",
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Store an approved Motomania frontend placement preference.")
    parser.add_argument("--skill-root", default=str(Path(__file__).resolve().parents[1]))
    parser.add_argument("--category", required=True, choices=VALID_CATEGORIES)
    parser.add_argument("--title", required=True)
    parser.add_argument("--rule", required=True)
    parser.add_argument("--avoid", default="")
    parser.add_argument("--validation", default="")
    parser.add_argument("--source", default="")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.strip())


def slug(value: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", value.lower()).strip("-")
    return cleaned[:60] or "preference"


def validate_text(args: argparse.Namespace) -> list[str]:
    errors: list[str] = []
    if len(normalize(args.title)) < 6:
        errors.append("--title is too short")
    if len(normalize(args.rule)) < 18:
        errors.append("--rule must be a reusable placement rule, not a tiny note")
    route_like = re.search(r"/[a-z0-9_-]+(?:/[a-z0-9_-]+)*", args.rule, re.I)
    if route_like and not re.search(r"\bfamily\b|\bsibling\b|\broute group\b", args.rule, re.I):
        errors.append("--rule looks route-specific; store the reusable principle instead")
    forbidden = ("copy this module", "copia este modulo", "truth", "verdad absoluta")
    haystack = f"{args.title} {args.rule} {args.avoid}".lower()
    if any(term in haystack for term in forbidden):
        errors.append("do not store screen-copy or permanent-comparison instructions")
    return errors


def build_entry(args: argparse.Namespace) -> tuple[str, str]:
    title = normalize(args.title)
    rule = normalize(args.rule)
    avoid = normalize(args.avoid)
    validation = normalize(args.validation)
    source = normalize(args.source)
    digest = hashlib.sha1(f"{args.category}|{title}|{rule}".encode("utf-8")).hexdigest()[:10]
    entry_id = f"{slug(title)}-{digest}"
    date = datetime.now().strftime("%Y-%m-%d")
    lines = [
        f"### {title}",
        "",
        f"- id: `{entry_id}`",
        f"- date: {date}",
        f"- category: `{args.category}`",
        f"- rule: {rule}",
    ]
    if avoid:
        lines.append(f"- avoid: {avoid}")
    if validation:
        lines.append(f"- validation: {validation}")
    if source:
        lines.append(f"- source: {source}")
    lines.append("")
    return entry_id, "\n".join(lines)


def main() -> int:
    args = parse_args()
    args.title = normalize(args.title)
    args.rule = normalize(args.rule)
    args.avoid = normalize(args.avoid)
    args.validation = normalize(args.validation)
    args.source = normalize(args.source)

    errors = validate_text(args)
    if errors:
        for error in errors:
            print(f"[remember_frontend_preference] {error}", file=sys.stderr)
        return 2

    skill_root = Path(args.skill_root).resolve()
    target = skill_root / "references" / "owner-placement-preferences.md"
    if not target.exists():
        print(f"[remember_frontend_preference] missing target: {target}", file=sys.stderr)
        return 1

    existing = target.read_text(encoding="utf-8")
    entry_id, entry = build_entry(args)
    if f"`{entry_id}`" in existing:
        print(f"Preference already stored: {entry_id}")
        return 0

    output = existing.rstrip() + "\n\n" + entry + "\n"
    if args.dry_run:
        print(entry)
        return 0
    target.write_text(output, encoding="utf-8")
    print(f"Stored preference: {entry_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
