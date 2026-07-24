#!/usr/bin/env python3
"""Import Claude Code skills and agents into Codex-compatible files."""

from __future__ import annotations

import argparse
import ast
import re
import shutil
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


MODEL_MAP = {
    "opus": ("gpt-5.6-sol", "high"),
    "sonnet": ("gpt-5.6-terra", "medium"),
    "haiku": ("gpt-5.6-luna", "low"),
}

SKILL_FRONTMATTER_KEYS = {
    "name",
    "description",
    "license",
    "compatibility",
    "metadata",
    "allowed-tools",
}

READ_ONLY_KEYWORDS = (
    "review",
    "reviewer",
    "レビュー",
    "監査",
    "audit",
    "調査",
    "investigate",
    "investigation",
    "explore",
    "explorer",
    "参照",
    "read-only",
    "readonly",
    "planner",
    "planning",
    "plan",
    "プラン",
    "計画",
    "docs",
    "document",
    "documentation",
    "ドキュメント",
)

WRITE_KEYWORDS = (
    "developer",
    "fixer",
    "debugger",
    "maintainer",
    "開発",
    "実装",
)


@dataclass
class FrontmatterDoc:
    data: dict[str, Any]
    body: str
    had_frontmatter: bool


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Convert .claude/skills and .claude/agents into Codex-compatible files."
    )
    parser.add_argument(
        "--project-root",
        type=Path,
        help="Project root. Defaults to nearest parent with .git.",
    )
    parser.add_argument(
        "--skills-only", action="store_true", help="Import only Claude Code skills."
    )
    parser.add_argument(
        "--agents-only", action="store_true", help="Import only Claude Code agents."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print planned changes without writing files.",
    )
    args = parser.parse_args()

    if args.skills_only and args.agents_only:
        parser.error("--skills-only and --agents-only cannot be used together")

    project_root = (
        args.project_root.resolve()
        if args.project_root
        else find_project_root(Path.cwd())
    )
    if project_root is None:
        print(
            "error: could not find project root; pass --project-root", file=sys.stderr
        )
        return 2

    imported = 0
    if not args.agents_only:
        imported += import_skills(project_root, dry_run=args.dry_run)
    if not args.skills_only:
        agent_count = import_agents(project_root, dry_run=args.dry_run)
        if agent_count is None:
            return 1
        imported += agent_count

    verb = "would import" if args.dry_run else "imported"
    print(f"{verb} {imported} item(s)")
    return 0


def find_project_root(start: Path) -> Path | None:
    current = start.resolve()
    while True:
        if (current / ".git").exists():
            return current
        if current.parent == current:
            return None
        current = current.parent


def import_skills(project_root: Path, *, dry_run: bool) -> int:
    source_root = project_root / ".claude" / "skills"
    target_root = project_root / ".agents" / "skills"
    if not source_root.is_dir():
        return 0

    count = 0
    for skill_dir in sorted(path for path in source_root.iterdir() if path.is_dir()):
        source_skill = skill_dir / "SKILL.md"
        if not source_skill.is_file():
            print(
                f"skip skill without SKILL.md: {relative(skill_dir, project_root)}",
                file=sys.stderr,
            )
            continue

        doc = parse_frontmatter(source_skill.read_text(encoding="utf-8"))
        target_name = sanitize_name(str(doc.data.get("name") or skill_dir.name))
        target_dir = target_root / target_name
        target_skill = target_dir / "SKILL.md"
        converted = convert_skill_doc(doc, name=target_name)

        print(
            f"{'would write' if dry_run else 'write'} {relative(target_skill, project_root)}"
        )
        if not dry_run:
            if target_dir.exists():
                shutil.rmtree(target_dir)
            shutil.copytree(
                skill_dir, target_dir, ignore=shutil.ignore_patterns("SKILL.md")
            )
            target_skill.write_text(converted, encoding="utf-8")
        count += 1
    return count


def import_agents(project_root: Path, *, dry_run: bool) -> int | None:
    source_root = project_root / ".claude" / "agents"
    target_root = project_root / ".codex" / "agents"
    if not source_root.is_dir():
        return 0
    if (project_root / ".codex").exists() and not (project_root / ".codex").is_dir():
        print(
            "error: .codex exists but is not a directory; cannot import agents",
            file=sys.stderr,
        )
        return None

    count = 0
    for source_agent in sorted(source_root.glob("*.md")):
        doc = parse_frontmatter(source_agent.read_text(encoding="utf-8"))
        name = sanitize_agent_name(str(doc.data.get("name") or source_agent.stem))
        target_agent = target_root / f"{name}.toml"
        converted = convert_agent_doc(doc, fallback_name=name)

        print(
            f"{'would write' if dry_run else 'write'} {relative(target_agent, project_root)}"
        )
        if not dry_run:
            target_root.mkdir(parents=True, exist_ok=True)
            target_agent.write_text(converted, encoding="utf-8")
        count += 1
    return count


def parse_frontmatter(text: str) -> FrontmatterDoc:
    if not text.startswith("---\n"):
        return FrontmatterDoc({}, text, False)

    end = text.find("\n---", 4)
    if end == -1:
        return FrontmatterDoc({}, text, False)

    raw = text[4:end].strip()
    body_start = end + len("\n---")
    if text[body_start : body_start + 1] == "\n":
        body_start += 1

    return FrontmatterDoc(parse_simple_yaml(raw), text[body_start:], True)


def parse_simple_yaml(raw: str) -> dict[str, Any]:
    result: dict[str, Any] = {}
    lines = raw.splitlines()
    index = 0
    while index < len(lines):
        line = lines[index]
        index += 1
        if (
            not line.strip()
            or line.lstrip().startswith("#")
            or line.startswith((" ", "\t"))
        ):
            continue
        if ":" not in line:
            continue

        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if value == "":
            nested: dict[str, Any] = {}
            while index < len(lines) and lines[index].startswith((" ", "\t")):
                nested_line = lines[index].strip()
                index += 1
                if (
                    not nested_line
                    or nested_line.startswith("#")
                    or ":" not in nested_line
                ):
                    continue
                nested_key, nested_value = nested_line.split(":", 1)
                nested[nested_key.strip()] = parse_scalar(nested_value.strip())
            result[key] = nested
        else:
            result[key] = parse_scalar(value)
    return result


def parse_scalar(value: str) -> Any:
    if value in {"true", "True"}:
        return True
    if value in {"false", "False"}:
        return False
    if value in {"null", "Null", "~"}:
        return None
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [parse_scalar(part.strip()) for part in split_csv(inner)]
    if (value.startswith('"') and value.endswith('"')) or (
        value.startswith("'") and value.endswith("'")
    ):
        return unquote(value)
    return value


def split_csv(value: str) -> list[str]:
    parts: list[str] = []
    current: list[str] = []
    quote: str | None = None
    escape = False
    for char in value:
        if escape:
            current.append(char)
            escape = False
        elif char == "\\":
            current.append(char)
            escape = True
        elif quote:
            current.append(char)
            if char == quote:
                quote = None
        elif char in {"'", '"'}:
            current.append(char)
            quote = char
        elif char == ",":
            parts.append("".join(current))
            current = []
        else:
            current.append(char)
    parts.append("".join(current))
    return parts


def unquote(value: str) -> str:
    try:
        parsed = ast.literal_eval(value)
    except (SyntaxError, ValueError):
        return value[1:-1]
    return str(parsed)


def convert_skill_doc(doc: FrontmatterDoc, *, name: str) -> str:
    source = doc.data
    description = str(
        source.get("description") or f"Imported Claude Code skill: {name}."
    )

    metadata: dict[str, Any] = {}
    if isinstance(source.get("metadata"), dict):
        metadata.update(source["metadata"])

    claude_fields = {
        key: value for key, value in source.items() if key not in SKILL_FRONTMATTER_KEYS
    }
    if claude_fields:
        metadata["claude"] = claude_fields

    model = str(source.get("model") or "").lower()
    if model in MODEL_MAP:
        codex_model, effort = MODEL_MAP[model]
        metadata["codex"] = {"model": codex_model, "model_reasoning_effort": effort}

    frontmatter: dict[str, Any] = {
        "name": name,
        "description": description,
    }
    for key in ("license", "compatibility", "allowed-tools"):
        if key in source and source[key] not in (None, ""):
            frontmatter[key] = source[key]
    if metadata:
        frontmatter["metadata"] = metadata

    return render_yaml(frontmatter) + "\n" + rewrite_claude_agent_refs(doc.body)


def convert_agent_doc(doc: FrontmatterDoc, *, fallback_name: str) -> str:
    source = doc.data
    name = sanitize_agent_name(str(source.get("name") or fallback_name))
    description = str(
        source.get("description") or f"Imported Claude Code agent: {name}."
    )
    body = rewrite_claude_agent_refs(doc.body).strip() or description
    model = str(source.get("model") or "").lower()
    codex_model, effort = MODEL_MAP.get(model, ("gpt-5.5", "medium"))
    comments = unsupported_agent_comments(source)

    lines: list[str] = []
    lines.extend(comments)
    lines.append(f"name = {toml_string(name)}")
    lines.append(f"description = {toml_string(description)}")
    lines.append(f"model = {toml_string(codex_model)}")
    lines.append(f"model_reasoning_effort = {toml_string(effort)}")
    if is_read_only_agent(name, description, body, source):
        lines.append('sandbox_mode = "read-only"')
    lines.append("developer_instructions = " + toml_multiline_string(body))
    lines.append("")
    return "\n".join(lines)


def unsupported_agent_comments(source: dict[str, Any]) -> list[str]:
    comments: list[str] = []
    for key in ("tools", "color", "memory"):
        if key in source and source[key] not in (None, ""):
            comments.append(f"# Claude {key}: {source[key]}")
    return comments


def is_read_only_agent(
    name: str, description: str, body: str, source: dict[str, Any]
) -> bool:
    name_lower = name.lower()
    haystack = " ".join([name, description, first_chars(body, 2000)]).lower()
    has_read_only_signal = any(
        keyword.lower() in haystack for keyword in READ_ONLY_KEYWORDS
    )
    has_write_role_name = any(
        keyword.lower() in name_lower for keyword in WRITE_KEYWORDS
    )

    tools = str(source.get("tools") or "").lower()
    write_tools = ("write", "edit", "multiedit", "notebookedit")
    if any(tool in tools for tool in write_tools):
        return False

    return has_read_only_signal and not has_write_role_name


def rewrite_claude_agent_refs(text: str) -> str:
    replacements = (
        (r"\bExplore エージェント\b", "explorer エージェント"),
        (r"\bExplore agent\b", "explorer agent"),
        (r"\bExplore Agent\b", "explorer Agent"),
    )
    result = text
    for pattern, replacement in replacements:
        result = re.sub(pattern, replacement, result)
    return result


def sanitize_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9-]+", "-", value.strip().lower())
    normalized = re.sub(r"-{2,}", "-", normalized).strip("-")
    return normalized or "imported-skill"


def sanitize_agent_name(value: str) -> str:
    normalized = re.sub(r"[^a-z0-9_-]+", "_", value.strip().lower().replace("-", "_"))
    normalized = re.sub(r"_{2,}", "_", normalized).strip("_")
    return normalized or "imported_agent"


def render_yaml(data: dict[str, Any]) -> str:
    lines = ["---"]
    for key, value in data.items():
        append_yaml_value(lines, key, value, indent=0)
    lines.append("---")
    return "\n".join(lines)


def append_yaml_value(lines: list[str], key: str, value: Any, *, indent: int) -> None:
    prefix = " " * indent
    if isinstance(value, dict):
        lines.append(f"{prefix}{key}:")
        for child_key, child_value in value.items():
            append_yaml_value(lines, str(child_key), child_value, indent=indent + 2)
    elif isinstance(value, list):
        lines.append(f"{prefix}{key}:")
        for item in value:
            lines.append(f"{prefix}  - {yaml_scalar(item)}")
    else:
        lines.append(f"{prefix}{key}: {yaml_scalar(value)}")


def yaml_scalar(value: Any) -> str:
    if value is True:
        return "true"
    if value is False:
        return "false"
    if value is None:
        return "null"
    text = str(value)
    if (
        text == ""
        or text.strip() != text
        or any(char in text for char in ":\n#[]{}&*!,>|%@`\"'")
    ):
        return (
            '"'
            + text.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
            + '"'
        )
    return text


def toml_string(value: str) -> str:
    return (
        '"' + value.replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n") + '"'
    )


def toml_multiline_string(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"""', '\\"\\"\\"')
    return '"""\n' + escaped + '\n"""'


def first_chars(value: str, limit: int) -> str:
    return value[:limit]


def relative(path: Path, root: Path) -> str:
    try:
        return str(path.relative_to(root))
    except ValueError:
        return str(path)


if __name__ == "__main__":
    raise SystemExit(main())
