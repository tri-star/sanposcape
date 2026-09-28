"""`sanpo_maps` モジュール内の依存規則（M1〜M9）を AST で検査する（ADR-011。旧
`maps/tests/test_dependency_direction.py` を置き換える）。

実行時 import（`pytest` の import 順）ではなく静的な AST 解析にする理由: 実行時
チェック（`sys.modules` を見る等）はテストの実行順序や他テストの import 状況に
依存して結果がぶれるが、AST 解析はソースコードだけから決定的に判定できる。
"""

import ast
from pathlib import Path

_SANPO_MAPS_DIR = Path(__file__).resolve().parents[1]
_SANPOSCAPE_DIR = _SANPO_MAPS_DIR.parent

#: 直下（共有カーネル）に置いてよいモジュールの stem（M2）。
_KERNEL_MODULE_NAMES = {"models", "exceptions", "permissions", "advisory_locks"}

#: サブパッケージ名（M1）。
_SUBPACKAGES = {"maps", "pins", "photos"}

#: サブパッケージごとに import してよい他のサブパッケージ（自分自身を含む, M1）。
_ALLOWED_SUBPACKAGE_DEPENDENCIES: dict[str, set[str]] = {
    "photos": {"photos"},
    "maps": {"maps", "photos"},
    "pins": {"pins", "maps", "photos"},
}

#: モジュールの外（`main.py`・`all_models.py`・他ドメイン）から import してよい公開面
#: （M7）。将来 BK-2・BK-7 等で公開面を広げる場合は ADR-011 の追補で決めてから足す。
_ALLOWED_PUBLIC_SURFACE = {
    "sanposcape.sanpo_maps.models",
    "sanposcape.sanpo_maps.exceptions",
    "sanposcape.sanpo_maps.maps.router",
    "sanposcape.sanpo_maps.pins.router",
    "sanposcape.sanpo_maps.photos.router",
    "sanposcape.sanpo_maps.photos.dev_storage_router",
}


def _iter_module_files() -> list[Path]:
    """本体コードだけを走査する（`tests/` 配下・`conftest.py`・`__pycache__` を除く）。"""
    return [
        path
        for path in _SANPO_MAPS_DIR.rglob("*.py")
        if "__pycache__" not in path.parts
        and "tests" not in path.parts
        and path.name != "conftest.py"
    ]


def _classify(path: Path) -> str:
    """`sanpo_maps` 直下なら `"kernel"`、サブパッケージ配下ならそのサブパッケージ名。"""
    relative = path.relative_to(_SANPO_MAPS_DIR)
    if len(relative.parts) == 1:
        return "kernel"
    return relative.parts[0]


def _parse(path: Path) -> ast.Module:
    return ast.parse(path.read_text(encoding="utf-8"), filename=str(path))


def _imported_module_names(tree: ast.Module) -> list[str]:
    """`import X` / `from X import Y` の `X` を集める（絶対 import のみ, M8 は別テスト）。"""
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None and node.level == 0:
            names.append(node.module)
    return names


def _relative_str(path: Path) -> str:
    return str(path.relative_to(_SANPOSCAPE_DIR))


def _iter_top_level_files() -> list[Path]:
    """直下（カーネル）のモジュール候補。`__init__.py`・`conftest.py` を除く。"""
    return [
        path
        for path in _SANPO_MAPS_DIR.glob("*.py")
        if path.stem != "__init__" and path.name != "conftest.py"
    ]


class TestTopLevelHasOnlyKernelModules:
    def test_top_level_has_only_kernel_modules(self) -> None:
        """M2: 直下（カーネル）に置けるのは models/exceptions/permissions/advisory_locks
        だけ。新しいファイルを足すときは `_KERNEL_MODULE_NAMES` を意識的に更新する。
        """
        offenders = sorted(
            path.name for path in _iter_top_level_files() if path.stem not in _KERNEL_MODULE_NAMES
        )
        assert offenders == [], (
            f"sanpo_maps 直下には kernel モジュール({sorted(_KERNEL_MODULE_NAMES)})だけを"
            f"置ける。見つかった違反: {offenders}"
        )


class TestKernelDoesNotImportSubpackages:
    def test_kernel_does_not_import_subpackages(self) -> None:
        """M1: カーネルはサブパッケージを import しない。"""
        offenders: dict[str, list[str]] = {}
        for path in _iter_top_level_files():
            forbidden = [
                name
                for name in _imported_module_names(_parse(path))
                if any(
                    name == f"sanposcape.sanpo_maps.{sub}"
                    or name.startswith(f"sanposcape.sanpo_maps.{sub}.")
                    for sub in _SUBPACKAGES
                )
            ]
            if forbidden:
                offenders[path.name] = forbidden
        assert offenders == {}, f"kernel はサブパッケージを import してはならない: {offenders}"


class TestSubpackageDependencyDirection:
    def test_subpackage_dependency_direction(self) -> None:
        """M1: 依存の向きは kernel <- photos <- maps <- pins（許可表のとおり）。"""
        offenders: dict[str, list[str]] = {}
        for path in _iter_module_files():
            category = _classify(path)
            if category not in _SUBPACKAGES:
                continue
            allowed = _ALLOWED_SUBPACKAGE_DEPENDENCIES[category]
            forbidden = []
            for name in _imported_module_names(_parse(path)):
                if not name.startswith("sanposcape.sanpo_maps."):
                    continue
                suffix = name[len("sanposcape.sanpo_maps.") :]
                imported_sub = suffix.split(".", 1)[0]
                if imported_sub in _SUBPACKAGES and imported_sub not in allowed:
                    forbidden.append(name)
            if forbidden:
                offenders[_relative_str(path)] = forbidden
        assert offenders == {}, f"許可されていない向きの import が見つかった: {offenders}"


class TestServicesDoNotImportOtherServices:
    def test_services_do_not_import_other_services(self) -> None:
        """M3: `service.py` は自分以外の `*.service` を import しない。"""
        service_module_names = {f"sanposcape.sanpo_maps.{sub}.service" for sub in _SUBPACKAGES}
        offenders: dict[str, list[str]] = {}
        for path in _iter_module_files():
            if path.name != "service.py":
                continue
            own_module = f"sanposcape.sanpo_maps.{_classify(path)}.service"
            forbidden = [
                name
                for name in _imported_module_names(_parse(path))
                if name in service_module_names and name != own_module
            ]
            if forbidden:
                offenders[_relative_str(path)] = forbidden
        assert offenders == {}, (
            f"service.py は他の service.py を import してはならない: {offenders}"
        )


class TestOnlyServicesCommitOrRollback:
    def test_only_services_commit_or_rollback(self) -> None:
        """M4: commit/rollback を呼ぶのは `service.py` だけ。"""
        offenders: list[str] = []
        for path in _iter_module_files():
            if path.name == "service.py":
                continue
            tree = _parse(path)
            calls_commit_or_rollback = any(
                isinstance(node, ast.Call)
                and isinstance(node.func, ast.Attribute)
                and node.func.attr in {"commit", "rollback"}
                for node in ast.walk(tree)
            )
            if calls_commit_or_rollback:
                offenders.append(_relative_str(path))
        assert offenders == [], f"commit()/rollback() は service.py だけが呼べる: {offenders}"


class TestOutsideCodeImportsOnlyPublicSurface:
    def test_outside_code_imports_only_public_surface(self) -> None:
        """M7: `sanpo_maps/` の外からは公開面（models・exceptions・各 router）だけを
        import できる。
        """
        offenders: dict[str, list[str]] = {}
        for path in _SANPOSCAPE_DIR.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            if "sanpo_maps" in path.parts:
                continue
            if "tests" in path.parts or path.name == "conftest.py":
                continue
            forbidden = [
                name
                for name in _imported_module_names(_parse(path))
                if (name == "sanposcape.sanpo_maps" or name.startswith("sanposcape.sanpo_maps."))
                and name not in _ALLOWED_PUBLIC_SURFACE
            ]
            if forbidden:
                offenders[_relative_str(path)] = forbidden
        assert offenders == {}, (
            f"sanpo_maps の外からは公開面({sorted(_ALLOWED_PUBLIC_SURFACE)})だけを"
            f"import できる(ADR-011 M7): {offenders}"
        )


class TestNoRelativeImports:
    def test_no_relative_imports(self) -> None:
        """M8: モジュール内の import は絶対 import のみ（相対 import 禁止）。"""
        offenders: dict[str, list[str]] = {}
        for path in _iter_module_files():
            tree = _parse(path)
            relative_imports = [
                f"{'.' * node.level}{node.module or ''}"
                for node in ast.walk(tree)
                if isinstance(node, ast.ImportFrom) and node.level > 0
            ]
            if relative_imports:
                offenders[_relative_str(path)] = relative_imports
        assert offenders == {}, f"相対 import が見つかった: {offenders}"


def _is_protocol_base(base: ast.expr) -> bool:
    if isinstance(base, ast.Name):
        return base.id == "Protocol"
    if isinstance(base, ast.Attribute):
        return base.attr == "Protocol"
    if isinstance(base, ast.Subscript):
        return _is_protocol_base(base.value)
    return False


class TestNoProtocolPorts:
    def test_no_protocol_ports(self) -> None:
        """M5: 本体コードで `Protocol`（`typing.Protocol`・`typing_extensions.Protocol`）を
        基底に持つクラスを定義しない。モジュール内で port を作らない。下位の Repository への
        クエリ移設・処理の下位への移動で解けなければユースケース層を導入する（ADR-011 M5・M9）。
        """
        offenders: dict[str, list[str]] = {}
        for path in _iter_module_files():
            tree = _parse(path)
            protocol_classes = [
                node.name
                for node in ast.walk(tree)
                if isinstance(node, ast.ClassDef)
                and any(_is_protocol_base(base) for base in node.bases)
            ]
            if protocol_classes:
                offenders[_relative_str(path)] = protocol_classes
        assert offenders == {}, (
            "モジュール内で port を作らない。下位の Repository へのクエリ移設・処理の下位への"
            f"移動で解けなければユースケース層を導入する(ADR-011 M5・M9): {offenders}"
        )


class TestScansKnownModules:
    def test_scans_known_modules(self) -> None:
        """検査対象が空になって静かに何も検査していない、という事故を防ぐ番兵。"""
        scanned = {_relative_str(path) for path in _iter_module_files()}
        expected = {
            "sanpo_maps/maps/service.py",
            "sanpo_maps/pins/service.py",
            "sanpo_maps/photos/service.py",
            "sanpo_maps/maps/access.py",
            "sanpo_maps/photos/cleanup.py",
        }
        assert expected <= scanned
