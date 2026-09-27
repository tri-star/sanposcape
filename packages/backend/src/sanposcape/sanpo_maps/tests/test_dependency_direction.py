"""`sanpo_maps` が `pins` を import しないことを AST で検査する（folder-structure.md の
依存方向、ADR-009 決定29）。

`pins → sanpo_maps` の一方向依存を保つため、`sanpo_maps/` 配下（tests 含む）のどの
`.py` ファイルも `sanposcape.pins` を import してはならない。地図の中身（ピン等）に
アクセスする必要がある処理は `sanpo_maps/contents.py` の `SanpoMapContents` port
（Protocol）を経由し、実装は `pins/service.py` の `PinService` が満たす。配線は
アプリ直下 `dependencies.py` で行う（`sanpo_maps/dependencies.py` に置くと
`sanpo_maps` が `pins` を import することになるため）。

実行時 import（`pytest` の import 順）ではなく静的な AST 解析にする理由: 実行時
チェック（`sys.modules` を見る等）はテストの実行順序や他テストの import 状況に
依存して結果がぶれるが、AST 解析はソースコードだけから決定的に判定できる。
"""

import ast
from pathlib import Path

_SANPO_MAPS_DIR = Path(__file__).resolve().parents[1]


def _iter_python_files() -> list[Path]:
    return [path for path in _SANPO_MAPS_DIR.rglob("*.py") if "__pycache__" not in path.parts]


def _imported_module_names(tree: ast.Module) -> list[str]:
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None:
            names.append(node.module)
    return names


class TestSanpoMapsDoesNotImportPins:
    def test_no_file_imports_sanposcape_pins(self) -> None:
        offenders: dict[str, list[str]] = {}
        for path in _iter_python_files():
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            forbidden = [
                name
                for name in _imported_module_names(tree)
                if name == "sanposcape.pins" or name.startswith("sanposcape.pins.")
            ]
            if forbidden:
                offenders[str(path.relative_to(_SANPO_MAPS_DIR.parent))] = forbidden

        assert offenders == {}, (
            f"sanpo_maps must not import sanposcape.pins, but found: {offenders}"
        )

    def test_scans_at_least_the_known_modules(self) -> None:
        """検査対象が空になって静かに何も検査していない、という事故を防ぐ番兵。"""
        scanned = {path.name for path in _iter_python_files()}
        assert {"service.py", "router.py", "contents.py"} <= scanned
