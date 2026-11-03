"""survey-structure.py のテスト。標準ライブラリだけで動かす。

    python3 -m unittest discover -s scripts/code-health/tests -v
"""

from __future__ import annotations

import importlib.util
import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

SCRIPT = Path(__file__).resolve().parents[1] / "survey-structure.py"
spec = importlib.util.spec_from_file_location("survey_structure", SCRIPT)
ss = importlib.util.module_from_spec(spec)
sys.modules["survey_structure"] = ss
spec.loader.exec_module(ss)

LIB = "packages/mobile/src/features/pin/lib"


class Repo:
    """一時ディレクトリにファイルを置く。"""

    def __init__(self) -> None:
        self._dir = tempfile.TemporaryDirectory()
        self.root = Path(self._dir.name)
        self.files: list[str] = []

    def add(self, path: str, text: str = "") -> None:
        target = self.root / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(textwrap.dedent(text), encoding="utf-8")
        self.files.append(path)

    def close(self) -> None:
        self._dir.cleanup()


class SubjectTest(unittest.TestCase):
    def test_subject_of(self) -> None:
        self.assertEqual(ss.subject_of(f"{LIB}/pinRead.test.ts"), f"{LIB}/pinRead.ts")
        self.assertEqual(ss.subject_of("a/Button.spec.tsx"), "a/Button.tsx")
        # backend は `tests/` に置く。1つ上のフォルダの実装に寄せる
        self.assertEqual(ss.subject_of("a/pins/tests/test_service.py"), "a/pins/service.py")
        self.assertEqual(ss.subject_of("a/__tests__/b.test.ts"), "a/b.ts")
        self.assertEqual(ss.subject_of(f"{LIB}/pinRead.ts"), f"{LIB}/pinRead.ts")


class TsImportTest(unittest.TestCase):
    def test_resolves_relative_alias_and_index(self) -> None:
        known = {
            f"{LIB}/a.ts",
            f"{LIB}/b.ts",
            f"{LIB}/c.tsx",
            "packages/mobile/src/lib/units/index.ts",
            "packages/mobile/src/features/pin/types.ts",
        }
        text = """
            import { b } from "./b";
            import type { C } from "@/features/pin/lib/c";
            import {
              x,
            } from "@/lib/units";
            export { t } from "../types";
            import React from "react";
            const lazy = () => import("./b");
            vi.mock("./b");
        """
        found = ss.ts_imports(f"{LIB}/a.ts", text, known)
        self.assertEqual(
            found,
            {f"{LIB}/b.ts", f"{LIB}/c.tsx", "packages/mobile/src/lib/units/index.ts", "packages/mobile/src/features/pin/types.ts"},
        )


class PyImportTest(unittest.TestCase):
    def test_resolves_absolute_relative_and_submodule(self) -> None:
        root = "packages/backend/src/sanposcape"
        known = {
            f"{root}/pins/service.py",
            f"{root}/pins/repository.py",
            f"{root}/pins/schemas.py",
            f"{root}/photos/photo_keys.py",
            f"{root}/pins/__init__.py",
        }
        text = textwrap.dedent("""
            from sanposcape.pins.repository import PinRepository
            from .schemas import PinCreate
            from sanposcape.photos import photo_keys
            import sanposcape.pins
            import pytest
        """)
        found = ss.py_imports(f"{root}/pins/service.py", text, known)
        self.assertEqual(found, {f"{root}/pins/repository.py", f"{root}/pins/schemas.py", f"{root}/photos/photo_keys.py"})

    def test_resolves_every_name_of_one_statement(self) -> None:
        root = "packages/backend/src/sanposcape"
        known = {f"{root}/pins/{n}.py" for n in ("service", "repository", "schemas")} | {f"{root}/core/a.py", f"{root}/core/b.py", f"{root}/x.py"}
        text = "from sanposcape.pins import repository, schemas\nimport sanposcape.core.a, sanposcape.core.b\n"
        found = ss.py_imports(f"{root}/x.py", text, known)
        self.assertEqual(found, {f"{root}/pins/repository.py", f"{root}/pins/schemas.py", f"{root}/core/a.py", f"{root}/core/b.py"})

    def test_syntax_error_is_empty(self) -> None:
        self.assertEqual(ss.py_imports("packages/backend/src/a.py", "def (", set()), set())


class CoChangeTest(unittest.TestCase):
    def test_counts_pairs_and_maps_tests_to_subjects(self) -> None:
        members = {f"{LIB}/a.ts", f"{LIB}/b.ts", f"{LIB}/c.ts"}
        commits = [
            [f"{LIB}/a.ts", f"{LIB}/b.test.ts"],
            [f"{LIB}/a.test.ts", f"{LIB}/b.ts", "packages/mobile/app/x.tsx"],
            [f"{LIB}/c.ts"],
        ]
        changes, pairs = ss.co_changes(commits, members, max_files=10)
        self.assertEqual(pairs[(f"{LIB}/a.ts", f"{LIB}/b.ts")], 2)
        self.assertEqual(changes[f"{LIB}/c.ts"], 1)

    def test_skips_pairs_of_bulk_commits_but_counts_changes(self) -> None:
        members = {f"{LIB}/{n}.ts" for n in "abcd"}
        commits = [sorted(members)]
        changes, pairs = ss.co_changes(commits, members, max_files=3)
        self.assertEqual(sum(pairs.values()), 0)
        self.assertEqual(changes[f"{LIB}/a.ts"], 1)


class GitCommitsTest(unittest.TestCase):
    def test_reads_non_ascii_paths_unquoted(self) -> None:
        repo = Repo()
        try:
            repo.add("packages/x/散歩.ts", "a\n")
            repo.add("packages/x/b.ts", "b\n")
            git = ["git", "-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "core.quotePath=true"]
            subprocess.run(["git", "init", "-q"], cwd=repo.root, check=True)
            subprocess.run([*git, "add", "."], cwd=repo.root, check=True)
            subprocess.run([*git, "commit", "-q", "-m", "x"], cwd=repo.root, check=True)
            # 開発者の global の設定（core.quotePath=false など）に左右されないよう、global と system の設定を切って読む。
            env = {"GIT_CONFIG_GLOBAL": os.devnull, "GIT_CONFIG_NOSYSTEM": "1"}
            with mock.patch.dict(os.environ, env):
                commits = ss.git_commits(repo.root, "packages/x", "10 years ago")
        finally:
            repo.close()
        self.assertEqual(commits, [["packages/x/b.ts", "packages/x/散歩.ts"]])


class SurveyFolderTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = Repo()

    def tearDown(self) -> None:
        self.repo.close()

    def test_lists_files_prefixes_imports_and_users(self) -> None:
        self.repo.add(f"{LIB}/pinEditDraft.ts", 'import { l } from "./pinLimits";\n')
        self.repo.add(f"{LIB}/pinEditDraft.test.ts", 'import { d } from "./pinEditDraft";\n')
        self.repo.add(f"{LIB}/pinLimits.ts", "export const l = 1;\n")
        self.repo.add(f"{LIB}/index.ts", "")
        self.repo.add("packages/mobile/src/features/pin/hooks/usePinEdit.ts", 'import { d } from "@/features/pin/lib/pinEditDraft";\n')
        self.repo.add(f"{LIB}/sub/pinX.ts", 'import { l } from "../pinLimits";\n')

        report = ss.survey_folder(self.repo.root, LIB, self.repo.files, commits=[], max_commit_files=10)

        self.assertEqual([r["file"] for r in report["files"]], ["index.ts", "pinEditDraft.ts", "pinLimits.ts"])
        self.assertTrue(next(r for r in report["files"] if r["file"] == "pinEditDraft.ts")["tested"])
        self.assertEqual(report["prefixes"]["edit"], ["pinEditDraft.ts"])
        self.assertEqual(report["imports"], {"pinEditDraft.ts": ["pinLimits.ts"]})
        # テストのファイル自身はフォルダの外の利用元に数えない。サブフォルダからの利用は外として数える
        self.assertEqual(report["users"]["pinEditDraft.ts"], {"packages/mobile/src/features/pin/hooks": 1})
        self.assertEqual(report["users"]["pinLimits.ts"], {f"{LIB}/sub": 1})
        self.assertIn("pinEditDraft.ts → pinLimits.ts", ss.render(report))


class SurveyBackendFolderTest(unittest.TestCase):
    def test_tests_folder_counts_as_tested_and_cochanged(self) -> None:
        repo = Repo()
        pins = "packages/backend/src/sanposcape/pins"
        try:
            repo.add(f"{pins}/service.py", "")
            repo.add(f"{pins}/router.py", "")
            repo.add(f"{pins}/tests/test_service.py", "")
            commits = [[f"{pins}/router.py", f"{pins}/tests/test_service.py"]]
            report = ss.survey_folder(repo.root, pins, repo.files, commits=commits, max_commit_files=10)
        finally:
            repo.close()
        tested = {r["file"]: r["tested"] for r in report["files"]}
        self.assertEqual(tested, {"router.py": False, "service.py": True})
        self.assertEqual(report["cochanges"], [])  # 1回だけなので出さない（2回以上）
        self.assertEqual(report["changes"], {"router.py": 1, "service.py": 1})


class SurveyPythonFileTest(unittest.TestCase):
    def setUp(self) -> None:
        self.repo = Repo()

    def tearDown(self) -> None:
        self.repo.close()

    def test_lists_defs_endpoints_fixtures_and_helpers(self) -> None:
        path = "packages/backend/src/sanposcape/pins/tests/test_router.py"
        self.repo.add(path, '''
            import pytest


            def _make_map(db):
                return 1


            class TestCreatePin:
                def test_requires_auth(self, client):
                    client.post("/pins", json={})

                def test_creates(self, client, db_session):
                    _make_map(db_session)
                    client.post("/pins", json={})


            class TestGetPin:
                @pytest.mark.parametrize("pin_id", ["x"])
                def test_get(self, client, pin_id):
                    client.post("/pins", json={})
                    client.get(f"/pins/{pin_id}?with=1")
                    client.get(f"/pins/{pin_id}")
                    _make_map(None)


            class TestVisited:
                def _patch(self, client, pin_id):
                    return client.patch(f"/pins/{pin_id}", json={})

                def _patch_twice(self, client):
                    self._patch(client, 1)
                    self._patch(client, 2)

                def test_a(self, client):
                    client.post("/pins", json={})
                    self._patch_twice(client)

                def test_b(self, client):
                    self._patch(client, 1)


            def test_module_level(client):
                client.delete("/pins/1")
        ''')

        report = ss.survey_python_file(self.repo.root, path)
        defs = {d["name"]: d for d in report["defs"]}

        self.assertEqual(defs["TestCreatePin"]["tests"], 2)
        self.assertEqual(defs["TestCreatePin"]["endpoints"], {"POST /pins": 2})
        self.assertEqual(defs["TestCreatePin"]["fixtures"], ["client", "db_session"])
        self.assertEqual(list(defs["TestGetPin"]["endpoints"].items()), [("GET /pins/{}", 2), ("POST /pins", 1)])
        # クラスの中のヘルパーが叩くものは、呼んだ回数ぶん数える（ヘルパーを通したヘルパーも）
        self.assertEqual(defs["TestVisited"]["endpoints"], {"PATCH /pins/{}": 3, "POST /pins": 1})
        self.assertEqual(defs["test_module_level"]["tests"], 1)
        self.assertEqual(defs["_make_map"]["tests"], 0)
        self.assertEqual(report["helpers"], {"_make_map": ["TestCreatePin", "TestGetPin"]})
        rendered = ss.render(report)
        self.assertIn("GET /pins/{} ×2", rendered)


if __name__ == "__main__":
    unittest.main()
