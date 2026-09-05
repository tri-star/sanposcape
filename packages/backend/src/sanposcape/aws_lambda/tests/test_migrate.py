"""`aws_lambda/migrate.py` の Config 組み立て・実行前ガードの回帰テスト。"""

from collections.abc import Generator

import pytest

from sanposcape.aws_lambda import migrate
from sanposcape.config import get_settings


class _FakeScriptDirectory:
    def get_current_head(self) -> str:
        return "fake-head-revision"


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.delenv("APP_SECRET_ARN", raising=False)
    monkeypatch.delenv("MIGRATE_DATABASE_DSN", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_handler_raises_when_migrate_dsn_is_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    """`neon_dsn_unpooled` が未投入でも Phase 1〜2 は完了できる必要がある一方、
    実行時には明示的なエラーメッセージで失敗すること（M-2）。"""

    def _fail_if_called(*args: object, **kwargs: object) -> None:
        raise AssertionError("alembic upgrade must not run without a migrate DSN")

    monkeypatch.setattr(migrate.command, "upgrade", _fail_if_called)

    with pytest.raises(migrate.MigrationConfigError, match="neon_dsn_unpooled"):
        migrate.handler({}, None)


def test_handler_runs_alembic_upgrade_with_absolute_script_location(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("MIGRATE_DATABASE_DSN", "postgres://user:pw@direct-host.example.com/db")
    get_settings.cache_clear()

    captured_configs: list[migrate.Config] = []

    def _fake_upgrade(config: migrate.Config, revision: str) -> None:
        captured_configs.append(config)
        assert revision == "head"

    monkeypatch.setattr(migrate.command, "upgrade", _fake_upgrade)
    monkeypatch.setattr(
        migrate.ScriptDirectory, "from_config", lambda config: _FakeScriptDirectory()
    )

    result = migrate.handler({}, None)

    assert len(captured_configs) == 1
    config = captured_configs[0]
    assert config.get_main_option("script_location") == "/var/task/alembic_migrations"
    assert config.get_main_option("sqlalchemy.url") == (
        "postgresql+psycopg://user:pw@direct-host.example.com/db?sslmode=require"
    )
    assert result == {"head": "fake-head-revision"}


def test_handler_calls_both_hydration_functions(monkeypatch: pytest.MonkeyPatch) -> None:
    """API 用・migrate 用の両方のハイドレーションが呼ばれること
    （API 用の設定 (`AUTH_JWT_SECRET` 等) も一貫させておく必要があるため）。"""
    monkeypatch.setenv("MIGRATE_DATABASE_DSN", "postgres://user:pw@direct-host.example.com/db")
    get_settings.cache_clear()

    calls: list[str] = []
    monkeypatch.setattr(migrate, "hydrate_environment_from_secret", lambda: calls.append("api"))
    monkeypatch.setattr(
        migrate, "hydrate_migration_environment_from_secret", lambda: calls.append("migrate")
    )
    monkeypatch.setattr(migrate.command, "upgrade", lambda config, revision: None)
    monkeypatch.setattr(
        migrate.ScriptDirectory, "from_config", lambda config: _FakeScriptDirectory()
    )

    migrate.handler({}, None)

    assert calls == ["api", "migrate"]


def test_script_location_matches_makefile_copy_destination() -> None:
    """Makefile のコピー先と `_ALEMBIC_SCRIPT_LOCATION` がズレていないこと。

    この2つは別ファイルで対になっており、片方だけ変えると
    `Can't find Python file /var/task/.../env.py` で**デプロイ後に初めて**落ちる。
    さらに、コピー先を `alembic` にすると pip が展開した PyPI の `alembic` パッケージと
    衝突し、`cp -r` が「既存ディレクトリの中へコピー」と解釈して成果物が
    `/var/task/alembic/alembic/` に潜り込む（実際にこの事故が起きた）。
    """
    from pathlib import Path

    makefile = (Path(__file__).resolve().parents[3].parent / "Makefile").read_text()

    copy_lines = [
        line.strip() for line in makefile.splitlines() if line.strip().startswith("cp -r alembic ")
    ]
    assert len(copy_lines) == 1, f"Makefile の alembic コピー行が想定と違う: {copy_lines}"

    destination = copy_lines[0].split('"')[-2]
    dest_name = destination.rsplit("/", 1)[-1]

    assert dest_name != "alembic", (
        "コピー先を 'alembic' にすると PyPI の alembic パッケージと衝突する"
    )
    assert migrate._ALEMBIC_SCRIPT_LOCATION.rsplit("/", 1)[-1] == dest_name, (
        f"Makefile のコピー先 '{dest_name}' と "
        f"_ALEMBIC_SCRIPT_LOCATION '{migrate._ALEMBIC_SCRIPT_LOCATION}' が一致していない"
    )
