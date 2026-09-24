#!/usr/bin/env python3
"""Validate discoverable Codex instructions without loading application dependencies."""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import tomllib


def validate(root: Path) -> list[str]:
    errors = []
    skills = root / ".agents/skills"
    documents = []
    for entry in sorted(skills.glob("*/SKILL.md")):
        text = entry.read_text()
        relative = entry.relative_to(root)
        parts = text.split("---", 2)
        if len(parts) != 3 or parts[0].strip():
            errors.append(f"{relative}: missing YAML frontmatter")
            continue
        front = parts[1]
        values = {}
        for key in ("name", "description"):
            match = re.search(rf"^{key}:\s*(.+)$", front, re.M)
            values[key] = match.group(1).strip().strip('"').strip("'") if match else ""
        if values["name"] != entry.parent.name or not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", values["name"]):
            errors.append(f"{relative}: skill name must match folder in kebab-case")
        if values["description"] in {"", "|", "|-", ">"}:
            errors.append(f"{relative}: description must be a meaningful single line")
        if re.search(r"^allowed-tools:.*(?:Task\(|Bash|Read)", front, re.M):
            errors.append(f"{relative}: Claude tool allowlist remains")
        documents.extend(p for p in entry.parent.rglob("*.md") if "assets" not in p.relative_to(entry.parent).parts)
    names = set()
    for entry in sorted((root / ".codex/agents").glob("*.toml")):
        try:
            data = tomllib.loads(entry.read_text())
            for key in ("name", "description", "developer_instructions"):
                if not isinstance(data.get(key), str) or not data[key].strip():
                    errors.append(f"{entry}: missing {key}")
            name = data.get("name")
            if name in names:
                errors.append(f"{entry}: duplicate agent name")
            names.add(name)
            if data.get("sandbox_mode") == "read-only" and "プランファイルを保存" in data.get("developer_instructions", ""):
                errors.append(f"{entry}: read-only agent instructed to save a plan")
        except tomllib.TOMLDecodeError as error:
            errors.append(f"{entry}: {error}")
    config = root / ".codex/config.toml"
    if config.exists():
        try:
            tomllib.loads(config.read_text())
        except tomllib.TOMLDecodeError as error:
            errors.append(f"{config}: {error}")
    documents.extend(p for p in [root / "AGENTS.md", root / "docs/codex-harness.md"] if p.exists())
    documents.extend(root.glob("packages/*/AGENTS.md"))
    for entry in sorted(set(documents)):
        text = entry.read_text()
        if re.search(r"(?:frontend|backend)-context|Task\((?:Plan|Explore)|Plan [Aa]gent|Explore Agent", text):
            errors.append(f"{entry.relative_to(root)}: obsolete agent/skill reference")
        for target in re.findall(r"\]\(([^)]+)\)", text):
            if "://" in target or target.startswith("#") or any(c in target for c in "<>{}"):
                continue
            path = target.split("#", 1)[0]
            if path and not (entry.parent / path).exists():
                errors.append(f"{entry.relative_to(root)}: broken link {target}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path)
    args = parser.parse_args()
    root = args.project_root or Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    errors = validate(root)
    for error in errors:
        print(error)
    print(f"harness validation: {len(errors)} error(s)")
    return bool(errors)


if __name__ == "__main__":
    raise SystemExit(main())
