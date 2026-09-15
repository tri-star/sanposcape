"""Behavioral tests: preservation, partial checkpoints, stale plans and no automatic writes."""
from __future__ import annotations

import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/import_claude_skill.py"
spec = importlib.util.spec_from_file_location("importer", SCRIPT)
imp = importlib.util.module_from_spec(spec)
spec.loader.exec_module(imp)


class ImportTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.source = ".claude/skills/mobile-workflow/SKILL.md"
        self.target = ".agents/skills/mobile-development/SKILL.md"
        self.write(self.source, "Claude plan and implement\n")
        self.write(self.target, "---\nname: mobile-development\ndescription: Develop mobile\n---\nCodex main implements\n")
        subprocess.run(["git", "-C", str(self.root), "add", "."], check=True)
        subprocess.run(["git", "-C", str(self.root), "-c", "user.name=Test", "-c", "user.email=test@example.invalid",
                        "-c", "core.hooksPath=/dev/null", "commit", "-qm", "fixture"], check=True)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        return path

    def decisions(self, plan):
        return {
            "plan_sha256": imp.digest(imp.encoded(plan)),
            "validation": ["fixture validation: passed"],
            "reviewed_target_drift": [x["path"] for x in plan["target_changes"]],
            "codex_only_targets": [],
            "units": {
                name: {"action": "adapt", "targets": [self.target], "reason": "Adapted to main agent"}
                for name in plan["units"]
            },
        }

    def checkpoint(self, plan=None, decisions=None):
        plan = plan or imp.make_plan(self.root)
        decisions = decisions or self.decisions(plan)
        result = imp.accept(self.root, plan, imp.digest(imp.encoded(plan)), decisions)
        imp.atomic_write(self.root / imp.STATE, result)
        return result

    def test_plan_does_not_write_or_overwrite(self):
        original = (self.root / self.target).read_bytes()
        result = subprocess.run([sys.executable, str(SCRIPT), "--project-root", str(self.root)],
                                check=True, capture_output=True, text=True)
        self.assertIn(self.source, result.stdout)
        self.assertFalse((self.root / imp.STATE).exists())
        self.assertEqual(original, (self.root / self.target).read_bytes())

    def test_initial_and_repeat_are_noop_after_accept(self):
        self.checkpoint()
        plan = imp.make_plan(self.root)
        self.assertEqual([], plan["source_changes"])
        self.assertEqual([], plan["target_changes"])

    def test_uncommitted_sources_are_snapshotted(self):
        self.write(self.source, "Uncommitted requirement\n")
        self.checkpoint()
        self.assertEqual("Uncommitted requirement\n", imp.state(self.root)[0]["sources"][self.source]["text"])

    def test_local_codex_changes_preserved_and_overlap_visible(self):
        self.checkpoint()
        self.write(self.source, "New source requirement\n")
        self.write(self.target, "Independent Codex customization\n")
        plan = imp.make_plan(self.root)
        self.assertEqual([self.target], plan["overlap"][imp.unit(self.source)])
        self.checkpoint(plan)
        self.assertEqual("Independent Codex customization\n", (self.root / self.target).read_text())

    def test_codex_only_drift_is_not_silently_accepted(self):
        self.checkpoint()
        self.write(self.target, "Unreviewed local edit\n")
        plan = imp.make_plan(self.root)
        self.checkpoint(plan)
        self.assertEqual([self.target], [x["path"] for x in imp.make_plan(self.root)["target_changes"]])

    def test_partial_accept_keeps_deferred_source(self):
        self.checkpoint()
        second = ".claude/agents/reviewer.md"
        self.write(self.source, "Handled requirement\n")
        self.write(second, "Pending requirement\n")
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["units"][second] = {"action": "defer", "targets": [], "reason": "Later"}
        self.checkpoint(plan, decisions)
        self.assertEqual([second], imp.make_plan(self.root)["units"])

    def test_shared_target_partial_accept_then_remaining_change(self):
        second = ".claude/agents/reviewer.md"
        self.write(second, "First review\n")
        self.checkpoint()
        self.write(self.source, "New workflow\n")
        self.write(second, "New review\n")
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["units"][second] = {"action": "defer", "targets": [], "reason": "Later"}
        self.write(self.target, "Workflow adapted, review unchanged\n")
        self.checkpoint(plan, decisions)
        next_plan = imp.make_plan(self.root)
        self.assertEqual([second], next_plan["units"])
        self.assertIn("New review", imp.show_diff(self.root, next_plan, "sources", [second]))

    def test_deleted_source_does_not_delete_target(self):
        self.checkpoint()
        (self.root / self.source).unlink()
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["units"][imp.unit(self.source)] = {"action": "omit", "targets": [], "reason": "Keep Codex feature"}
        self.checkpoint(plan, decisions)
        self.assertTrue((self.root / self.target).exists())
        self.assertEqual([], imp.make_plan(self.root)["source_changes"])

    def test_rename_is_explicit_delete_and_add(self):
        self.checkpoint()
        moved = ".claude/skills/new-workflow/SKILL.md"
        self.write(moved, (self.root / self.source).read_text())
        (self.root / self.source).unlink()
        plan = imp.make_plan(self.root)
        self.assertEqual({"added", "deleted"}, {x["kind"] for x in plan["source_changes"]})
        self.assertEqual(2, len(plan["units"]))

    def test_source_changed_since_plan_is_rejected_without_checkpoint(self):
        plan = imp.make_plan(self.root)
        self.write(self.source, "Changed during adaptation")
        with self.assertRaisesRegex(ValueError, "sources changed"):
            self.checkpoint(plan)
        self.assertFalse((self.root / imp.STATE).exists())

    def test_stale_baseline_is_rejected(self):
        plan = imp.make_plan(self.root)
        self.checkpoint(plan)
        with self.assertRaisesRegex(ValueError, "baseline changed"):
            self.checkpoint(plan)

    def test_incomplete_decisions_do_not_advance(self):
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["units"] = {}
        with self.assertRaisesRegex(ValueError, "every changed"):
            self.checkpoint(plan, decisions)
        self.assertFalse((self.root / imp.STATE).exists())

    def test_wrong_plan_hash_is_rejected(self):
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["plan_sha256"] = "wrong"
        with self.assertRaisesRegex(ValueError, "exact plan"):
            self.checkpoint(plan, decisions)

    def test_unmapped_new_target_edit_is_rejected(self):
        plan = imp.make_plan(self.root)
        self.write(".agents/skills/other/SKILL.md", "Not mapped")
        with self.assertRaisesRegex(ValueError, "unmapped Codex"):
            self.checkpoint(plan)

    def test_target_outside_harness_is_rejected(self):
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["codex_only_targets"] = ["../escape"]
        with self.assertRaisesRegex(ValueError, "unsafe path"):
            self.checkpoint(plan, decisions)

    def test_symlink_source_is_rejected(self):
        self.write("external.txt", "Do not read through link")
        (self.root / self.source).unlink()
        (self.root / self.source).symlink_to(self.root / "external.txt")
        with self.assertRaisesRegex(ValueError, "symlinks"):
            imp.make_plan(self.root)

    def test_binary_asset_and_executable_mode(self):
        asset = ".claude/skills/mobile-workflow/assets/image.bin"
        p = self.root / asset
        p.parent.mkdir(parents=True)
        p.write_bytes(b"\x00\xff\x01")
        p.chmod(0o755)
        result = self.checkpoint()
        self.assertIn("base64", result["sources"][asset])
        self.assertTrue(result["sources"][asset]["executable"])

    def test_deferred_deletion_remains_visible(self):
        self.checkpoint()
        (self.root / self.source).unlink()
        plan = imp.make_plan(self.root)
        decisions = self.decisions(plan)
        decisions["units"][imp.unit(self.source)] = {"action": "defer", "targets": [], "reason": "Need decision"}
        self.checkpoint(plan, decisions)
        self.assertEqual("deleted", imp.make_plan(self.root)["source_changes"][0]["kind"])

    def test_cli_accept_validates_and_checkpoints(self):
        plan = imp.make_plan(self.root)
        plan_path = self.root / "plan.json"
        plan_path.write_bytes(imp.encoded(plan))
        decisions_path = self.write("decisions.json", json.dumps(self.decisions(plan)))
        result = subprocess.run([sys.executable, str(SCRIPT), "--project-root", str(self.root),
                                 "accept", "--plan", str(plan_path), "--decisions", str(decisions_path)],
                                capture_output=True, text=True)
        self.assertEqual(0, result.returncode, result.stderr)
        self.assertEqual([], imp.make_plan(self.root)["source_changes"])

    def test_plan_output_cannot_traverse_into_managed_files_or_baseline(self):
        for destination in (".agents/skills/accidental/SKILL.md", imp.STATE):
            with self.subTest(destination=destination):
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), "--project-root", str(self.root),
                     "plan", "--output", str(self.root / "tmp" / ".." / destination)],
                    capture_output=True, text=True,
                )
                self.assertNotEqual(0, result.returncode)
                self.assertIn("must not contain", result.stderr)
                self.assertFalse((self.root / destination).exists())
        self.assertEqual([imp.unit(self.source)], imp.make_plan(self.root)["units"])

    def test_plan_output_cannot_be_managed_file_or_overwrite_existing(self):
        self.write("existing-plan.json", "keep me")
        for destination in (".agents/skills/new/SKILL.md", imp.STATE, "existing-plan.json"):
            with self.subTest(destination=destination):
                result = subprocess.run(
                    [sys.executable, str(SCRIPT), "--project-root", str(self.root),
                     "plan", "--output", str(self.root / destination)],
                    capture_output=True, text=True,
                )
                self.assertNotEqual(0, result.returncode)
        self.assertEqual("keep me", (self.root / "existing-plan.json").read_text())
        self.assertFalse((self.root / imp.STATE).exists())

    def test_plan_data_cannot_masquerade_as_baseline(self):
        plan = imp.make_plan(self.root)
        imp.atomic_write(self.root / imp.STATE, plan)
        with self.assertRaisesRegex(ValueError, "invalid baseline"):
            imp.make_plan(self.root)


if __name__ == "__main__":
    unittest.main()
