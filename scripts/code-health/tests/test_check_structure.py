"""check-structure.py のテスト。標準ライブラリだけで動かす。

    python3 -m unittest discover -s scripts/code-health/tests -v
"""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "check-structure.py"
spec = importlib.util.spec_from_file_location("check_structure", SCRIPT)
cs = importlib.util.module_from_spec(spec)
sys.modules["check_structure"] = cs  # dataclass が型の解決でモジュールを引くため
spec.loader.exec_module(cs)


class Repo:
    """一時ディレクトリにファイルを置いて scan に渡す。"""

    def __init__(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.files: list[str] = []

    def add(self, path: str, lines: int = 1) -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("x\n" * lines, encoding="utf-8")
        self.files.append(path)

    def scan(self):
        return cs.scan(self.root, self.files)

    def close(self) -> None:
        self._dir.cleanup()


def entry(kind: str, path: str, value: int, prefix: str | None = None, issue: str = "SS-1", reason: str = "理由") -> dict:
    e = {"kind": kind, "path": path, "value": value, "issue": issue, "reason": reason}
    if prefix:
        e["prefix"] = prefix
    return e


class ClassifyTest(unittest.TestCase):
    def test_is_test(self) -> None:
        for path in [
            "packages/mobile/src/lib/units.test.ts",
            "packages/mobile/src/lib/Button.spec.tsx",
            "packages/backend/src/a/tests/helpers.py",
            "packages/backend/src/a/test_router.py",
            "packages/backend/src/a/router_test.py",
            "packages/backend/src/a/conftest.py",
            "packages/mobile/src/__tests__/x.ts",
        ]:
            self.assertTrue(cs.is_test(path), path)
        for path in ["packages/mobile/src/lib/units.ts", "packages/backend/src/a/testing_utils.py"]:
            self.assertFalse(cs.is_test(path), path)

    def test_is_target(self) -> None:
        self.assertTrue(cs.is_target("packages/mobile/src/lib/units.ts"))
        self.assertTrue(cs.is_target("scripts/knowledge/check-doc-references.py"))
        self.assertFalse(cs.is_target("packages/mobile/src/api/generated/model/pin.ts"))
        self.assertFalse(cs.is_target("packages/mobile/docs/mock/support.js"))
        self.assertFalse(cs.is_target("packages/mobile/assets/icon.png"))
        self.assertFalse(cs.is_target("docs/adr/x.md"))

    def test_first_word(self) -> None:
        self.assertEqual(cs.first_word("sanpoMapCache.ts"), "sanpo")
        self.assertEqual(cs.first_word("SanpoMapDetailView.tsx"), "sanpo")
        self.assertEqual(cs.first_word("photo_attacher.py"), "photo")
        self.assertEqual(cs.first_word("usePinEdit.ts"), "pin")
        self.assertEqual(cs.first_word("URLParser.ts"), "url")
        # 親フォルダの名前と同じ最初の語は飛ばす。1語だけなら残す
        self.assertEqual(cs.first_word("pinEditDraft.ts", "src/features/pin/lib"), "edit")
        self.assertEqual(cs.first_word("usePinEdit.ts", "src/features/pin/hooks"), "edit")
        self.assertEqual(cs.first_word("pin.ts", "src/features/pin/lib"), "pin")
        self.assertEqual(cs.first_word("sanpo_map_service.py", "src/sanpo_maps"), "map")


class ScanTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = Repo()

    def tearDown(self) -> None:
        self.repo.close()

    def test_file_lines_impl_and_test_thresholds(self) -> None:
        self.repo.add("packages/a/src/big.ts", 801)
        self.repo.add("packages/a/src/warn.ts", 501)
        self.repo.add("packages/a/src/ok.ts", 500)
        self.repo.add("packages/a/src/big.test.ts", 1501)
        self.repo.add("packages/a/src/warn.test.ts", 1001)
        self.repo.add("packages/a/src/ok.test.ts", 1000)
        violations, warnings = self.repo.scan()
        self.assertEqual({v.path for v in violations}, {"packages/a/src/big.ts", "packages/a/src/big.test.ts"})
        self.assertEqual({w.path for w in warnings}, {"packages/a/src/warn.ts", "packages/a/src/warn.test.ts"})

    def test_folder_files_excludes_tests_and_structural(self) -> None:
        for i in range(20):
            self.repo.add(f"packages/a/src/lib/m{i}x.ts")
            self.repo.add(f"packages/a/src/lib/m{i}x.test.ts")
        self.repo.add("packages/a/src/lib/__init__.py")
        violations, _ = self.repo.scan()
        self.assertEqual([v for v in violations if v.kind == "folder-files"], [])

        self.repo.add("packages/a/src/lib/extra.ts")
        violations, _ = self.repo.scan()
        folder = [v for v in violations if v.kind == "folder-files"]
        self.assertEqual(len(folder), 1)
        self.assertEqual((folder[0].path, folder[0].value), ("packages/a/src/lib", 21))

    def test_folder_check_skips_generated_and_migrations(self) -> None:
        for i in range(25):
            self.repo.add(f"packages/mobile/src/api/generated/f{i}.ts")
            self.repo.add(f"packages/backend/alembic/versions/v{i}_add.py")
        violations, _ = self.repo.scan()
        self.assertEqual(violations, [])

    def test_prefix_concentration(self) -> None:
        for i in range(7):
            self.repo.add(f"packages/a/src/lib/photo{i}Thing.ts")
        violations, _ = self.repo.scan()
        self.assertEqual([v for v in violations if v.kind == "prefix"], [])

        self.repo.add("packages/a/src/lib/photoExtra.ts")
        self.repo.add("packages/a/src/lib/photoExtra.test.ts")  # テストは数えない
        violations, _ = self.repo.scan()
        prefix = [v for v in violations if v.kind == "prefix"]
        self.assertEqual([(v.path, v.prefix, v.value) for v in prefix], [("packages/a/src/lib", "photo", 8)])


class RatchetTest(unittest.TestCase):
    def finding(self, kind: str, path: str, value: int, prefix: str | None = None):
        return cs.Finding(kind, path, value, 0, prefix=prefix)

    def test_new_violation_fails(self) -> None:
        result = cs.compare([self.finding("file-lines", "a.py", 900)], [])
        self.assertEqual(len(result.new), 1)

    def test_known_violation_passes(self) -> None:
        result = cs.compare([self.finding("file-lines", "a.py", 900)], [entry("file-lines", "a.py", 900)])
        self.assertEqual((result.new, result.worsened, len(result.known)), ([], [], 1))

    def test_worsened_violation_fails(self) -> None:
        result = cs.compare([self.finding("folder-files", "lib", 22)], [entry("folder-files", "lib", 21)])
        self.assertEqual([(f.value, recorded) for f, recorded in result.worsened], [(22, 21)])

    def test_improved_and_resolved_are_reported_not_failed(self) -> None:
        result = cs.compare(
            [self.finding("folder-files", "lib", 21)],
            [entry("folder-files", "lib", 25), entry("file-lines", "gone.py", 900)],
        )
        self.assertEqual((result.new, result.worsened), ([], []))
        self.assertEqual(len(result.lowerable), 1)
        self.assertEqual([e["path"] for e in result.resolved], ["gone.py"])

    def test_prefix_entries_are_keyed_by_prefix(self) -> None:
        result = cs.compare(
            [self.finding("prefix", "lib", 9, "photo")],
            [entry("prefix", "lib", 9, prefix="sanpo")],
        )
        self.assertEqual(len(result.new), 1)
        self.assertEqual(len(result.resolved), 1)

    def test_baseline_requires_issue_and_reason(self) -> None:
        self.assertEqual(cs.validate_baseline([entry("file-lines", "a.py", 900)]), [])
        problems = cs.validate_baseline([
            entry("file-lines", "a.py", 900, issue=""),
            entry("file-lines", "b.py", 900, issue="未定"),
            entry("file-lines", "c.py", 900, reason=" "),
            entry("prefix", "lib", 9),
            {"kind": "file-lines", "path": "d.py", "issue": "SS-1", "reason": "r"},
        ])
        self.assertEqual(len(problems), 5)
        self.assertEqual(
            cs.validate_baseline([entry("file-lines", "a.py", 900), entry("file-lines", "a.py", 901)]),
            ["file-lines a.py: 重複している"],
        )

    def test_regenerated_baseline_keeps_issue_and_reason(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "baseline.json"
            previous = [entry("file-lines", "a.py", 950, issue="SS-9", reason="あとで分ける")]
            cs.write_baseline(path, [self.finding("file-lines", "a.py", 900), self.finding("file-lines", "b.py", 801)], previous)
            entries = json.loads(path.read_text(encoding="utf-8"))["entries"]
        self.assertEqual(entries[0], entry("file-lines", "a.py", 900, issue="SS-9", reason="あとで分ける"))
        self.assertEqual((entries[1]["path"], entries[1]["issue"], entries[1]["reason"]), ("b.py", "", ""))
        self.assertEqual(len(cs.validate_baseline(entries)), 2)  # 新しい項目は埋めるまで落ちる


if __name__ == "__main__":
    unittest.main()
