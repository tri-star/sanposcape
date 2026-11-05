"""report-health.py のテスト。標準ライブラリだけで動かす（jscpd・knip・vulture は流さない）。

    python3 -m unittest discover -s scripts/code-health/tests -v
"""

from __future__ import annotations

import importlib.util
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "report-health.py"
spec = importlib.util.spec_from_file_location("report_health", SCRIPT)
rh = importlib.util.module_from_spec(spec)
sys.modules["report_health"] = rh
spec.loader.exec_module(rh)

PIN = "packages/mobile/src/features/pin/lib"
WALK = "packages/mobile/src/features/walk/lib"


class HotspotTest(unittest.TestCase):
    def test_ranks_by_changes_times_lines_and_ignores_tests(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for name, lines in (("big.ts", 100), ("small.ts", 10), ("big.test.ts", 1000)):
                (root / PIN).mkdir(parents=True, exist_ok=True)
                (root / PIN / name).write_text("x\n" * lines, encoding="utf-8")
            files = [f"{PIN}/big.ts", f"{PIN}/small.ts", f"{PIN}/big.test.ts"]
            impl = rh.implementation_files(files)
            commits = [[f"{PIN}/big.ts"], [f"{PIN}/small.ts"], [f"{PIN}/small.ts"], [f"{PIN}/big.test.ts", f"{PIN}/small.ts"]]
            rows = rh.hotspots(root, impl, commits, top=10)
        self.assertEqual([r["path"] for r in rows], [f"{PIN}/big.ts", f"{PIN}/small.ts"])
        self.assertEqual(rows[0]["score"], 100)
        self.assertEqual(rows[1]["changes"], 3)


class CouplingTest(unittest.TestCase):
    def test_keeps_only_pairs_in_different_folders(self) -> None:
        impl = {f"{PIN}/a.ts", f"{PIN}/b.ts", f"{WALK}/c.ts"}
        commits = [[f"{PIN}/a.ts", f"{PIN}/b.ts", f"{WALK}/c.ts"]] * 3
        rows = rh.coupling(impl, commits, top=10)
        self.assertEqual([r["files"] for r in rows], [[f"{PIN}/a.ts", f"{WALK}/c.ts"], [f"{PIN}/b.ts", f"{WALK}/c.ts"]])
        self.assertEqual(rows[0]["ratio"], 1.0)

    def test_maps_tests_to_subjects_and_needs_min_count(self) -> None:
        impl = {f"{PIN}/a.ts", f"{WALK}/c.ts"}
        commits = [[f"{PIN}/a.test.ts", f"{WALK}/c.ts"], [f"{PIN}/a.ts", f"{WALK}/c.ts"], [f"{PIN}/a.ts"]]
        self.assertEqual(rh.coupling(impl, commits, top=10), [])
        rows = rh.coupling(impl, commits, top=10, min_count=2)
        self.assertEqual(rows, [{"files": [f"{PIN}/a.ts", f"{WALK}/c.ts"], "count": 2, "ratio": 1.0}])

    def test_skips_bulk_commits(self) -> None:
        impl = {f"{PIN}/a.ts", f"{WALK}/c.ts", f"{WALK}/d.ts"}
        commits = [sorted(impl)] * 3
        self.assertEqual(rh.coupling(impl, commits, top=10, max_commit_files=2), [])


def _dup(a: str, b: str, lines: int) -> dict:
    return {"firstFile": {"name": a, "start": 1, "end": lines}, "secondFile": {"name": b, "start": 5, "end": 4 + lines}, "lines": lines}


class ClonesTest(unittest.TestCase):
    def test_groups_by_pair_and_separates_test_only_clones(self) -> None:
        root = Path("/repo")
        report = {
            "duplicates": [
                _dup(f"/repo/{PIN}/a.ts", f"/repo/{WALK}/b.ts", 10),
                _dup(f"/repo/{WALK}/b.ts", f"/repo/{PIN}/a.ts", 5),
                _dup(f"/repo/{PIN}/x.ts", f"/repo/{PIN}/y.ts", 30),
                _dup(f"/repo/{PIN}/a.test.ts", f"/repo/{PIN}/x.test.ts", 40),
            ],
            "statistics": {
                "total": {"percentage": 3.14159, "clones": 4},
                "formats": {"typescript": {"percentage": 2.5, "sources": 3}, "css": {"percentage": 0, "sources": 0}},
            },
        }
        result = rh.summarize_clones(report, root, top=10)
        self.assertEqual(result["total_percentage"], 3.14)
        self.assertEqual(result["formats"], {"typescript": 2.5})
        self.assertEqual(result["test_only"], {"pairs": 1, "lines": 40})
        self.assertEqual([p["files"] for p in result["pairs"]], [[f"{PIN}/x.ts", f"{PIN}/y.ts"], [f"{PIN}/a.ts", f"{WALK}/b.ts"]])
        self.assertEqual(result["pairs"][1]["lines"], 15)
        self.assertEqual(result["pairs"][1]["clones"], 2)


class KnipTest(unittest.TestCase):
    def test_groups_exports_by_file_and_lists_files_and_dependencies(self) -> None:
        report = {"issues": [
            {"file": "src/a.ts", "files": [{"name": "src/a.ts"}], "exports": [{"name": "X"}, {"name": "Y"}], "types": []},
            {"file": "package.json", "dependencies": [{"name": "left-pad"}]},
        ]}
        result = rh.summarize_knip(report, "packages/mobile")
        self.assertEqual(result["counts"], {"files": 1, "exports": 2, "dependencies": 1})
        self.assertEqual(result["items"]["exports"], [{"path": "packages/mobile/src/a.ts", "names": ["X", "Y"]}])
        self.assertEqual(result["items"]["dependencies"], ["packages/mobile/package.json: left-pad"])

    def test_keeps_duplicates_and_categories_it_does_not_name(self) -> None:
        report = {"issues": [
            {"file": "src/a.ts", "duplicates": [[{"name": "foo"}, {"name": "default"}]], "catalog": []},
            {"file": "package.json", "binaries": [{"name": "maestro"}], "owners": [{"name": "@team"}]},
        ]}
        result = rh.summarize_knip(report, "packages/mobile")
        self.assertEqual(result["counts"], {"duplicates": 1, "binaries": 1})
        self.assertEqual(result["items"]["duplicates"], [{"path": "packages/mobile/src/a.ts", "names": ["foo = default"]}])
        self.assertEqual(result["items"]["binaries"], ["packages/mobile/package.json: maestro"])

    def test_skips_without_generated_api(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "packages/mobile/node_modules").mkdir(parents=True)
            with self.assertRaisesRegex(rh.ToolUnavailable, "Orval"):
                rh.run_knip(root)


class VultureTest(unittest.TestCase):
    def test_parses_lines(self) -> None:
        output = "src/a.py:3: unused function 'f' (60% confidence)\nnoise\nsrc/tests/test_a.py:9: unused variable 'x' (100% confidence)\n"
        rows = rh.parse_vulture(output, "packages/backend")
        self.assertEqual(rows[0], {"path": "packages/backend/src/a.py", "line": 3, "message": "unused function 'f'", "confidence": 60})
        self.assertEqual(len(rows), 2)


class ToolTest(unittest.TestCase):
    def test_missing_command_is_skipped_with_reason(self) -> None:
        with mock.patch.object(subprocess, "run", side_effect=FileNotFoundError):
            result = rh.guarded("jscpd", rh.run_tool, ["pnpm", "dlx", "jscpd"], Path("."))
        self.assertEqual(result["status"], "skipped")
        self.assertIn("pnpm", result["reason"])

    def test_unexpected_exit_code_is_unavailable(self) -> None:
        done = subprocess.CompletedProcess([], 2, stdout="", stderr="boom\n")
        with mock.patch.object(subprocess, "run", return_value=done), self.assertRaisesRegex(rh.ToolUnavailable, "exit 2: boom"):
            rh.run_tool(["x"], Path("."))

    def test_exit_code_allowed_per_tool(self) -> None:
        done = subprocess.CompletedProcess([], 1, stdout="out", stderr="")
        with mock.patch.object(subprocess, "run", return_value=done):
            self.assertEqual(rh.run_tool(["x"], Path("."), ok_codes=(0, 1)).stdout, "out")
            with self.assertRaises(rh.ToolUnavailable):
                rh.run_tool(["x"], Path("."))

    def test_vulture_fetch_failure_is_skipped_not_zero(self) -> None:
        # uvx がパッケージを取得できないと exit 1。件数 0 として扱わない
        failed = subprocess.CompletedProcess([], 1, stdout="", stderr="error: No solution found\n")
        with mock.patch.object(subprocess, "run", return_value=failed):
            result = rh.guarded("vulture", rh.run_vulture, Path("."))
        self.assertEqual(result["status"], "skipped")
        self.assertIn("No solution found", result["reason"])

    def test_vulture_reports_files_it_could_not_parse(self) -> None:
        done = subprocess.CompletedProcess(
            [], 3, stdout="src/a.py:3: unused function 'f' (60% confidence)\n",
            stderr='src/b.py:10: invalid syntax at "class X[T]:"\n',
        )
        with mock.patch.object(subprocess, "run", return_value=done) as run:
            result = rh.guarded("vulture", rh.run_vulture, Path("."))
        self.assertEqual(result["errors"], ['packages/backend/src/b.py:10: invalid syntax at "class X[T]:"'])
        self.assertEqual(run.call_args.args[0][:3], ["uvx", "--python", "3.12"])
        self.assertIn("解析できなかったファイル", rh._render_unused({"status": "skipped", "reason": "-"}, result)[-2])

    def test_jscpd_failure_does_not_reuse_previous_report(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out_dir = Path(tmp)
            (out_dir / "jscpd-report.json").write_text('{"duplicates": [], "statistics": {}}', encoding="utf-8")
            failed = subprocess.CompletedProcess([], 1, stdout="", stderr="ERR_PNPM_FETCH_404\n")
            with mock.patch.object(subprocess, "run", return_value=failed):
                result = rh.guarded("jscpd", rh.run_jscpd, Path(tmp), out_dir, 10)
            self.assertEqual(result["status"], "skipped")
            self.assertFalse((out_dir / "jscpd-report.json").exists())

    def test_knip_unreadable_output_is_skipped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "packages/mobile/node_modules").mkdir(parents=True)
            (root / "packages/mobile/src/api/generated").mkdir(parents=True)
            failed = subprocess.CompletedProcess([], 1, stdout="", stderr="ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL knip not found\n")
            with mock.patch.object(subprocess, "run", return_value=failed):
                result = rh.guarded("knip", rh.run_knip, root)
        self.assertEqual(result["status"], "skipped")
        self.assertIn("knip not found", result["reason"])


class RenderTest(unittest.TestCase):
    def test_renders_skipped_sections(self) -> None:
        skipped = {"status": "skipped", "reason": "--skip-tools"}
        report = {
            "generated_at": "2026-11-05", "since": "6 months ago",
            "hotspots": [{"path": "a.py", "changes": 2, "lines": 10, "score": 20}],
            "coupling": [],
            "clones": skipped, "knip": skipped, "vulture": skipped,
            "structure": {"baseline": 1, "by_issue": {"SS-1": 1}, "new": [], "worsened": [], "lowerable": [], "resolved": ["prefix a `b`"], "warnings": 0},
        }
        text = rh.render(report)
        self.assertIn("- a.py: 変更 2 回 × 10 行 = 20", text)
        self.assertEqual(text.count("省略: --skip-tools"), 3)
        self.assertIn("- 外せる: prefix a `b`", text)


if __name__ == "__main__":
    unittest.main()
