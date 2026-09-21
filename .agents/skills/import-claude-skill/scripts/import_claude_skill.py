#!/usr/bin/env python3
"""Compare Claude/Codex snapshots; never generate or overwrite active definitions."""

from __future__ import annotations

import argparse
import base64
import difflib
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import sys
import tempfile

SCHEMA = 1
STATE = ".codex/claude-import/baseline.json"
SOURCE_PREFIXES = (".claude/skills/", ".claude/agents/")
TARGET_PREFIXES = (".agents/skills/", ".codex/agents/")
TARGET_FILES = {"AGENTS.md", ".codex/config.toml", "docs/codex-harness.md"}


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def encoded(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()


def safe_path(root: Path, relative: str) -> Path:
    part = PurePosixPath(relative)
    if part.is_absolute() or not part.parts or ".." in part.parts or str(part) != relative:
        raise ValueError(f"unsafe path: {relative}")
    candidate = root
    for name in part.parts:
        candidate = candidate / name
        if candidate.is_symlink():
            raise ValueError(f"symlinks are not imported: {relative}")
    return candidate


def is_source(path: str) -> bool:
    return path.startswith(SOURCE_PREFIXES) or path == "CLAUDE.md" or (
        path.startswith("packages/") and path.endswith("/CLAUDE.md")
    )


def is_target(path: str) -> bool:
    return path.startswith(TARGET_PREFIXES) or path in TARGET_FILES or (
        path.startswith("packages/") and path.endswith("/AGENTS.md")
    )


def unit(path: str) -> str:
    parts = path.split("/")
    if path.startswith(".claude/skills/"):
        return "/".join(parts[:3])
    return path


def git(root: Path, *args: str) -> str:
    return subprocess.check_output(["git", "-C", str(root), *args]).decode()


def scan(root: Path, predicate) -> dict:
    names = git(root, "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0")
    result = {}
    for name in sorted(set(filter(predicate, filter(None, names)))):
        path = safe_path(root, name)
        if not path.exists():  # A tracked deletion.
            continue
        if not path.is_file():
            raise ValueError(f"expected a regular file: {name}")
        data = path.read_bytes()
        entry = {"sha256": digest(data), "executable": bool(path.stat().st_mode & 0o111)}
        try:
            entry["text"] = data.decode("utf-8")
        except UnicodeDecodeError:
            entry["base64"] = base64.b64encode(data).decode("ascii")
        result[name] = entry
    return result


def state(root: Path) -> tuple[dict, str | None]:
    path = safe_path(root, STATE)
    if not path.exists():
        return {"schema": SCHEMA, "sources": {}, "targets": {}, "decisions": {}}, None
    data = path.read_bytes()
    value = json.loads(data)
    if value.get("schema") != SCHEMA or not all(
        isinstance(value.get(key), dict) for key in ("sources", "targets", "decisions")
    ):
        raise ValueError("invalid baseline schema; a plan is not an accepted baseline")
    return value, digest(data)


def changes(before: dict, after: dict) -> list[dict]:
    return [
        {"path": name, "kind": "added" if name not in before else "deleted" if name not in after else "modified"}
        for name in sorted(before.keys() | after.keys())
        if before.get(name) != after.get(name)
    ]


def make_plan(root: Path) -> dict:
    baseline, checksum = state(root)
    sources, targets = scan(root, is_source), scan(root, is_target)
    source_changes = changes(baseline["sources"], sources)
    target_changes = changes(baseline["targets"], targets)
    units = sorted({unit(item["path"]) for item in source_changes})
    target_names = {item["path"] for item in target_changes}
    overlap = {
        name: sorted(set(baseline["decisions"].get(name, {}).get("targets", [])) & target_names)
        for name in units
    }
    return {
        "schema": SCHEMA, "baseline_sha256": checksum,
        "source_head": git(root, "rev-parse", "HEAD").strip(),
        "sources": sources, "targets": targets,
        "source_changes": source_changes, "target_changes": target_changes,
        "units": units, "overlap": {k: v for k, v in overlap.items() if v},
    }


def summary(plan: dict) -> dict:
    return {key: plan[key] for key in (
        "baseline_sha256", "source_head", "units", "source_changes", "target_changes", "overlap"
    )}


def atomic_write(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".import-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(encoded(value))
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def load_plan(path: Path) -> tuple[dict, str]:
    raw = path.read_bytes()
    plan = json.loads(raw)
    if plan.get("schema") != SCHEMA:
        raise ValueError("unsupported plan schema")
    return plan, digest(raw)


def show_diff(root: Path, plan: dict, side: str, paths: list[str]) -> str:
    baseline, checksum = state(root)
    if checksum != plan["baseline_sha256"]:
        raise ValueError("baseline changed; create a new plan")
    before, after = baseline[side], plan[side]
    names = paths or [x["path"] for x in changes(before, after)]
    output = []
    for name in names:
        if name not in before and name not in after:
            raise ValueError(f"path absent from {side}: {name}")
        old, new = before.get(name, {}), after.get(name, {})
        output.append(f"--- {name}: {old.get('sha256', 'absent')} -> {new.get('sha256', 'absent')}\n")
        if "base64" in old or "base64" in new:
            output.append("Binary content changed; inspect the source asset separately.\n")
        else:
            output.extend(difflib.unified_diff(
                old.get("text", "").splitlines(keepends=True),
                new.get("text", "").splitlines(keepends=True),
                fromfile="baseline/" + name, tofile="current/" + name,
            ))
        if old.get("executable") != new.get("executable"):
            output.append(f"executable: {old.get('executable')} -> {new.get('executable')}\n")
    return "".join(output)


def accept(root: Path, plan: dict, plan_hash: str, decisions: dict) -> dict:
    """Advance only reviewed source units and explicitly owned target files."""
    baseline, checksum = state(root)
    if checksum != plan["baseline_sha256"]:
        raise ValueError("baseline changed; create a new plan")
    if decisions.get("plan_sha256") != plan_hash:
        raise ValueError("decisions must reference the exact plan SHA256")
    if scan(root, is_source) != plan["sources"]:
        raise ValueError("Claude sources changed since planning; create a new plan")
    if not isinstance(decisions.get("validation"), list) or not decisions["validation"] or not all(
        isinstance(x, str) and x.strip() for x in decisions["validation"]
    ):
        raise ValueError("record completed validation commands/results")
    required = {unit(x["path"]) for x in changes(baseline["sources"], plan["sources"])}
    records = decisions.get("units", {})
    if set(records) != required:
        raise ValueError("decide every changed source unit exactly once (use defer for pending)")
    drift = {x["path"] for x in changes(baseline["targets"], plan["targets"])}
    if set(decisions.get("reviewed_target_drift", [])) != drift:
        raise ValueError("acknowledge all Codex changes present when planning")
    current_targets = scan(root, is_target)
    owned = set(decisions.get("codex_only_targets", []))
    for name, record in records.items():
        action = record.get("action")
        if action not in {"adapt", "retain", "omit", "defer"} or not record.get("reason", "").strip():
            raise ValueError(f"invalid decision/reason: {name}")
        targets = record.get("targets", [])
        if not isinstance(targets, list) or not all(isinstance(x, str) for x in targets):
            raise ValueError(f"invalid targets: {name}")
        if action in {"omit", "defer"} and targets:
            raise ValueError(f"{action} must not advance target files: {name}")
        if action in {"adapt", "retain"} and not targets:
            raise ValueError(f"{action} requires target paths: {name}")
        if action != "defer":
            owned.update(targets)
    known_targets = baseline["targets"].keys() | plan["targets"].keys() | current_targets.keys()
    for name in owned:
        safe_path(root, name)
        if not is_target(name) or name not in known_targets:
            raise ValueError(f"unknown or out-of-scope target: {name}")
    edited = {x["path"] for x in changes(plan["targets"], current_targets)}
    if edited - owned:
        raise ValueError("unmapped Codex edits: " + ", ".join(sorted(edited - owned)))
    # Pre-existing local edits are preserved on disk, and stay visible until explicitly accepted.
    new = json.loads(json.dumps(baseline))
    for name, record in records.items():
        if record["action"] == "defer":
            continue
        for path in list(new["sources"]):
            if unit(path) == name:
                del new["sources"][path]
        new["sources"].update({p: v for p, v in plan["sources"].items() if unit(p) == name})
        new["decisions"][name] = {**record, "source_head": plan["source_head"]}
    for name in owned:
        if name in current_targets:
            new["targets"][name] = current_targets[name]
        else:
            new["targets"].pop(name, None)
    new["last_accept"] = {
        "plan_sha256": plan_hash, "source_head": plan["source_head"],
        "validation": decisions["validation"],
        "deferred_units": sorted(k for k, v in records.items() if v["action"] == "defer"),
        "codex_only_targets": sorted(decisions.get("codex_only_targets", [])),
    }
    return new


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-root", type=Path)
    sub = parser.add_subparsers(dest="command")
    prepare = sub.add_parser("plan", help="Read-only comparison; optionally save a review plan")
    prepare.add_argument("--output", type=Path)
    inspect = sub.add_parser("diff", help="Read the exact source or Codex snapshot delta")
    inspect.add_argument("--plan", required=True, type=Path)
    inspect.add_argument("--side", choices=("sources", "targets"), default="sources")
    inspect.add_argument("--path", action="append", default=[])
    finish = sub.add_parser("accept", help="Checkpoint reviewed changes; does not edit definitions")
    finish.add_argument("--plan", required=True, type=Path)
    finish.add_argument("--decisions", required=True, type=Path)
    args = parser.parse_args()
    root = (args.project_root or Path(git(Path.cwd(), "rev-parse", "--show-toplevel").strip())).resolve()
    if args.command in (None, "plan"):
        plan = make_plan(root)
        if getattr(args, "output", None):
            if ".." in args.output.parts:
                raise ValueError("plan output must not contain '..'")
            destination = args.output.absolute()
            if destination.exists() or destination.is_symlink():
                raise ValueError("plan output already exists; choose a new file")
            # Plans are temporary review data, never live definitions or the baseline.
            for parent in (destination, *destination.parents):
                if parent.is_symlink():
                    raise ValueError("plan output must not use symlinks")
            try:
                relative = destination.relative_to(root).as_posix()
            except ValueError:
                relative = None
            if relative and (is_source(relative) or is_target(relative) or relative.startswith(".codex/claude-import/")):
                raise ValueError("plan output must be outside managed definitions and baseline")
            atomic_write(destination, plan)
            print(f"plan_sha256: {digest(destination.read_bytes())}")
        print(json.dumps(summary(plan), ensure_ascii=False, indent=2))
    else:
        plan, plan_hash = load_plan(args.plan)
        if args.command == "diff":
            print(show_diff(root, plan, args.side, args.path), end="")
        else:
            import validate_harness
            errors = validate_harness.validate(root)
            if errors:
                raise ValueError("harness validation failed:\n" + "\n".join(errors))
            target = safe_path(root, STATE)
            target.parent.mkdir(parents=True, exist_ok=True)
            lock = safe_path(root, ".codex/claude-import/.lock")
            with lock.open("w") as stream:
                fcntl.flock(stream, fcntl.LOCK_EX)
                result = accept(root, plan, plan_hash, json.loads(args.decisions.read_text()))
                atomic_write(target, result)
            print(f"accepted baseline: {STATE}; deferred: {len(result['last_accept']['deferred_units'])}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, subprocess.CalledProcessError, KeyError, TypeError) as error:
        print(f"error: {error}", file=sys.stderr)
        raise SystemExit(2)
