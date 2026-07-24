---
name: import-claude-skill
description: Convert and sync Claude Code skills from .claude/skills into Codex Agent Skills under .agents/skills, and Claude Code agents from .claude/agents into Codex custom subagents under .codex/agents. Use when the user asks to import, migrate, convert, or synchronize Claude Code Skill or Agent definitions for Codex.
---

# import-claude-skill

Use this skill when importing Claude Code skill or agent definitions into a Codex-compatible project layout.

## What This Skill Does

- Finds the project root by walking upward until it finds `.git` as a directory or file.
- Converts `<project-root>/.claude/skills/*/SKILL.md` into Agent Skills under `<project-root>/.agents/skills/*/SKILL.md`.
- Converts `<project-root>/.claude/agents/*.md` into Codex custom subagents under `<project-root>/.codex/agents/*.toml`.
- Overwrites generated targets so repeated runs act as synchronization.

## Run

From anywhere inside the repository:

```bash
python3 .agents/skills/import-claude-skill/scripts/import_claude_skill.py
```

If you are outside the repository or want an explicit root:

```bash
python3 /path/to/project/.agents/skills/import-claude-skill/scripts/import_claude_skill.py --project-root /path/to/project
```

Use `--skills-only`, `--agents-only`, or `--dry-run` when you need a narrower or preview run.

## Conversion Rules

### Skills

- Source: `.claude/skills/<skill-name>/SKILL.md`
- Target: `.agents/skills/<skill-name>/SKILL.md`
- Keeps the Markdown body and bundled files from the Claude skill directory.
- Normalizes frontmatter for the Agent Skills specification:
  - keeps `name` and `description` when valid
  - derives a valid lowercase hyphenated `name` from the directory when needed
  - moves unsupported Claude-specific frontmatter fields into `metadata.claude`
  - maps a Claude `model` field into `metadata.codex.model` and `metadata.codex.model_reasoning_effort`
  - keeps `allowed-tools` only when present because it is part of the Agent Skills specification

### Agents

- Source: `.claude/agents/*.md`
- Target: `.codex/agents/*.toml`
- Converts YAML frontmatter plus Markdown body into a standalone Codex custom agent TOML.
- Required Codex fields are always emitted: `name`, `description`, and `developer_instructions`.
- Claude model names are mapped as follows:
  - `opus` -> `model = "gpt-5.5"`, `model_reasoning_effort = "xhigh"`
  - `sonnet` -> `model = "gpt-5.5"`, `model_reasoning_effort = "medium"`
  - `haiku` -> `model = "gpt-5.5"`, `model_reasoning_effort = "low"`
- References to Claude Code's generic `Explore` agent are rewritten to Codex's `explorer` agent.
- Read-only review, audit, investigation, planning, and documentation agents are emitted with `sandbox_mode = "read-only"`.
- Claude-only fields such as `tools`, `color`, and `memory` are preserved as comments in the generated TOML when they cannot be represented directly.

## Notes

- If `.codex` exists as a file, the agent conversion cannot create `.codex/agents`; fix the path conflict before running agent import.
- The script intentionally uses only the Python standard library.
- Review generated files after the first run, especially `sandbox_mode` decisions, because read-only detection is heuristic.
