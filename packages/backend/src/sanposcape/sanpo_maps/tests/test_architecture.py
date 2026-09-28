"""`sanpo_maps` モジュール内の依存規則（M1〜M9）を AST で検査する（ADR-011。旧
`sanpo_maps/tests/test_dependency_direction.py` を置き換える）。

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
    """`import X` / `from X import Y` の `X`、および `X.Y`（`from X import Y` が
    サブモジュール `Y` を import している場合の完全修飾名）の候補を集める
    （絶対 import のみ, M8 は別テスト）。

    `from sanposcape.sanpo_maps import maps` のような形は `node.module`
    （`sanposcape.sanpo_maps`）だけでは、実際に import されたサブモジュール `maps` を
    取りこぼす。`f"{node.module}.{alias.name}"` も候補に加えることでこの形を拾う。
    `Y` がサブモジュールではなくクラス・関数（例: `from sanposcape.sanpo_maps.models
    import Pin` の `Pin`）の場合も候補は増えるだけで、以降の判定（M7 の公開面チェック等）は
    prefix ベースにしてあるため誤検出しない。
    """
    names: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module is not None and node.level == 0:
            names.append(node.module)
            names.extend(f"{node.module}.{alias.name}" for alias in node.names)
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


def _covered_by_public_surface(name: str) -> bool:
    """`name` が公開面そのもの、または公開面配下（`from <公開面> import <名前>` で
    生じる `<公開面>.<名前>` 候補）かどうかを判定する（M7）。厳密な等値比較だけだと、
    `_imported_module_names()` が `from ... import ...` から作る `X.Y` 候補
    （例: `from sanposcape.sanpo_maps.models import Pin` の `...models.Pin`）を
    誤って forbidden 扱いしてしまう。
    """
    return any(
        name == allowed or name.startswith(f"{allowed}.") for allowed in _ALLOWED_PUBLIC_SURFACE
    )


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
                and not _covered_by_public_surface(name)
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


def _is_abc_base(base: ast.expr) -> bool:
    """基底クラスが `abc.ABC`・`abc.ABCMeta`（`typing` 経由の別名も含め、末尾の属性名だけで
    判定する）かどうか。
    """
    if isinstance(base, ast.Name):
        return base.id in {"ABC", "ABCMeta"}
    if isinstance(base, ast.Attribute):
        return base.attr in {"ABC", "ABCMeta"}
    return False


def _has_abc_metaclass_keyword(node: ast.ClassDef) -> bool:
    """`class Foo(metaclass=ABCMeta)` のように、基底クラスではなく `metaclass=` キーワードで
    `ABCMeta` を指定する形も検出する。
    """
    for keyword in node.keywords:
        if keyword.arg != "metaclass":
            continue
        value = keyword.value
        if isinstance(value, ast.Name) and value.id == "ABCMeta":
            return True
        if isinstance(value, ast.Attribute) and value.attr == "ABCMeta":
            return True
    return False


class TestNoProtocolPorts:
    def test_no_protocol_ports(self) -> None:
        """M5: 本体コードで `Protocol`（`typing.Protocol`・`typing_extensions.Protocol`）や
        `abc.ABC`/`abc.ABCMeta`（`metaclass=ABCMeta` を含む）を基底に持つクラスを定義しない。
        モジュール内で port を作らない。下位の Repository へのクエリ移設・処理の下位への移動で
        解けなければユースケース層を導入する（ADR-011 M5・M9）。

        `Callable` 型のコンストラクタ引数による事実上の port（依存性逆転をクラスではなく
        1関数で行う形）はクラス定義を伴わないため AST では判定しにくい。これはレビューで
        確認する（ADR-011 決定3 M5 の注記）。
        """
        offenders: dict[str, list[str]] = {}
        for path in _iter_module_files():
            tree = _parse(path)
            port_classes = [
                node.name
                for node in ast.walk(tree)
                if isinstance(node, ast.ClassDef)
                and (
                    any(_is_protocol_base(base) for base in node.bases)
                    or any(_is_abc_base(base) for base in node.bases)
                    or _has_abc_metaclass_keyword(node)
                )
            ]
            if port_classes:
                offenders[_relative_str(path)] = port_classes
        assert offenders == {}, (
            "モジュール内で port を作らない（Protocol・abc.ABC/ABCMeta のいずれも禁止）。"
            "下位の Repository へのクエリ移設・処理の下位への移動で"
            f"解けなければユースケース層を導入する(ADR-011 M5・M9): {offenders}"
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


class TestImportedModuleNames:
    """`_imported_module_names()` 自体の単体テスト（ローカルレビュー A1）。

    `from X import Y` から `X`（`node.module`）だけでなく `X.Y` の完全修飾候補も
    集めることを、AST 検査全体を経由せず直接検証する。
    """

    def test_import_statement_collects_full_dotted_name(self) -> None:
        tree = ast.parse("import sanposcape.sanpo_maps.maps.service\n")
        assert _imported_module_names(tree) == ["sanposcape.sanpo_maps.maps.service"]

    def test_from_import_submodule_adds_module_and_attribute_candidates(self) -> None:
        """`from sanposcape.sanpo_maps import maps` は `node.module`（パッケージ名）だけでは
        取りこぼす。`maps`（サブモジュール）を import している事実を拾えることを確認する。
        """
        tree = ast.parse("from sanposcape.sanpo_maps import maps\n")
        assert _imported_module_names(tree) == [
            "sanposcape.sanpo_maps",
            "sanposcape.sanpo_maps.maps",
        ]

    def test_from_import_nested_submodule(self) -> None:
        """`from sanposcape.sanpo_maps.maps import service` は `...maps.service` という
        候補を作る（M3 の service.py 同士の import 検査にも掛かる形）。
        """
        tree = ast.parse("from sanposcape.sanpo_maps.maps import service\n")
        assert _imported_module_names(tree) == [
            "sanposcape.sanpo_maps.maps",
            "sanposcape.sanpo_maps.maps.service",
        ]

    def test_from_import_class_name_only_adds_extra_candidate(self) -> None:
        """`Y` がサブモジュールではなくクラス（`from sanposcape.sanpo_maps.models import Pin`
        の `Pin`）でも、候補が1つ増えるだけで例外にはならない（誤検出しないことは M7 の
        `_covered_by_public_surface()` 側のテストで確認する）。
        """
        tree = ast.parse("from sanposcape.sanpo_maps.models import Pin\n")
        assert _imported_module_names(tree) == [
            "sanposcape.sanpo_maps.models",
            "sanposcape.sanpo_maps.models.Pin",
        ]

    def test_relative_import_is_excluded(self) -> None:
        """M8 の対象（相対 import）はここでは集めない（`node.level == 0` のみ）。"""
        tree = ast.parse("from . import models\n")
        assert _imported_module_names(tree) == []


class TestCoveredByPublicSurface:
    """`_covered_by_public_surface()` 自体の単体テスト（M7 の prefix 判定, A1 関連）。"""

    def test_exact_match_is_covered(self) -> None:
        assert _covered_by_public_surface("sanposcape.sanpo_maps.models") is True

    def test_attribute_of_public_module_is_covered(self) -> None:
        """`from sanposcape.sanpo_maps.models import Pin` が作る `...models.Pin` は
        既存の公開面判定を壊さない。
        """
        assert _covered_by_public_surface("sanposcape.sanpo_maps.models.Pin") is True

    def test_non_public_subpackage_is_not_covered(self) -> None:
        """`from sanposcape.sanpo_maps import maps` が作る `...sanpo_maps.maps` は
        公開面に含まれないため forbidden のままである（A1 が検出すべき違反そのもの）。
        """
        assert _covered_by_public_surface("sanposcape.sanpo_maps.maps") is False
