"""`aws_lambda/migrate.py` の Config 組み立て・実行前ガード・ログの回帰テスト。"""

import logging
from collections.abc import Callable, Generator

import pytest

from sanposcape.aws_lambda import migrate
from sanposcape.config import get_settings


@pytest.fixture(autouse=True)
def _isolate_env(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.delenv("APP_SECRET_ARN", raising=False)
    monkeypatch.delenv("MIGRATE_DATABASE_DSN", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def _restore_logger_levels() -> Generator[None, None, None]:
    """handler が `sanposcape` / `alembic` / root のレベルを書き換えるので、テストごとに戻す。"""
    loggers = [logging.getLogger(), logging.getLogger("sanposcape"), logging.getLogger("alembic")]
    saved = [logger.level for logger in loggers]
    yield
    for logger, level in zip(loggers, saved, strict=True):
        logger.setLevel(level)


def _fake_db_revisions(*revisions: str | None) -> Callable[[str], str | None]:
    """`_read_db_revision` の代わり。呼ばれるたびに `revisions` を先頭から返す（適用前→適用後）。"""
    remaining = list(revisions)

    def _read(database_url: str) -> str | None:
        return remaining.pop(0)

    return _read


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
        migrate, "_read_db_revision", _fake_db_revisions("old-revision", "new-revision")
    )

    result = migrate.handler({}, None)

    assert len(captured_configs) == 1
    config = captured_configs[0]
    assert config.get_main_option("script_location") == "/var/task/alembic_migrations"
    assert config.attributes[migrate.DATABASE_URL_ATTRIBUTE] == (
        "postgresql+psycopg://user:pw@direct-host.example.com/db?sslmode=require"
    )
    assert result == {"before": "old-revision", "head": "new-revision"}


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
        migrate, "_read_db_revision", _fake_db_revisions("old-revision", "new-revision")
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


def test_url_with_percent_encoded_password_does_not_break_configparser(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """パスワードに `%` が含まれていても Config の組み立てが壊れないこと。

    Neon が生成するパスワードは URL エンコードされていることがある（`!` → `%21`）。
    `config.set_main_option("sqlalchemy.url", ...)` は値を configparser に書き込むため、
    `%` が変数補間として解釈され `ValueError: invalid interpolation syntax` で落ちる。
    実際に dev で踏んだため、`config.attributes` 経由に変更した回帰テスト。
    """
    monkeypatch.setenv(
        "MIGRATE_DATABASE_DSN",
        "postgresql://user:pw%21with%25percent@direct-host.example.com/db",
    )
    get_settings.cache_clear()

    monkeypatch.setattr(migrate.command, "upgrade", lambda config, revision: None)
    monkeypatch.setattr(
        migrate, "_read_db_revision", _fake_db_revisions("old-revision", "new-revision")
    )

    result = migrate.handler({}, None)

    assert result == {"before": "old-revision", "head": "new-revision"}


def test_handler_rejects_pooled_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """`neon_dsn_unpooled` に pooled の DSN が入っていたら実行前に止めること。

    pooled でも単純な DDL は通ってしまい、壊れていることに気付けないため
    （実際に dev で `-pooler` を指していた）。
    """
    monkeypatch.setenv(
        "MIGRATE_DATABASE_DSN",
        "postgresql://user:pw@ep-example-123-pooler.c-3.ap-southeast-1.aws.neon.tech/db",
    )
    get_settings.cache_clear()

    def _fail_if_called(*args: object, **kwargs: object) -> None:
        raise AssertionError("alembic upgrade must not run against a pooled endpoint")

    monkeypatch.setattr(migrate.command, "upgrade", _fail_if_called)

    with pytest.raises(migrate.MigrationConfigError, match="pooled endpoint"):
        migrate.handler({}, None)


def test_handler_accepts_direct_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    """`-pooler` を含まない direct ホストは通ること（ガードの誤検知が無いこと）。"""
    monkeypatch.setenv(
        "MIGRATE_DATABASE_DSN",
        "postgresql://user:pw@ep-example-123.c-3.ap-southeast-1.aws.neon.tech/db",
    )
    get_settings.cache_clear()

    monkeypatch.setattr(migrate.command, "upgrade", lambda config, revision: None)
    monkeypatch.setattr(
        migrate, "_read_db_revision", _fake_db_revisions("old-revision", "new-revision")
    )

    assert migrate.handler({}, None) == {"before": "old-revision", "head": "new-revision"}


def test_handler_returns_same_revisions_when_nothing_is_pending(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """適用するものが無いときは `before` と `head` が同じになること。

    戻り値の `head` は成果物の head ではなく DB から読んだ値。古いコードで invoke しても
    （デプロイの完了前に invoke した等）、`before == head` で何も入らなかったと分かる。
    """
    monkeypatch.setenv("MIGRATE_DATABASE_DSN", "postgres://user:pw@direct-host.example.com/db")
    get_settings.cache_clear()

    monkeypatch.setattr(migrate.command, "upgrade", lambda config, revision: None)
    monkeypatch.setattr(
        migrate, "_read_db_revision", _fake_db_revisions("same-revision", "same-revision")
    )

    assert migrate.handler({}, None) == {"before": "same-revision", "head": "same-revision"}


class _ListHandler(logging.Handler):
    def __init__(self) -> None:
        super().__init__(logging.NOTSET)
        self.records: list[logging.LogRecord] = []

    def emit(self, record: logging.LogRecord) -> None:
        self.records.append(record)


def test_handler_emits_info_logs_even_when_root_is_warning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Lambda と同じく root が WARNING のままでも、完了ログと alembic の適用ログが出ること。

    Migrate の `LoggingConfig` は Text でアプリのログレベルを指定していないため、ランタイムは
    root のレベルを設定しない。以前は `sanposcape` / `alembic` のレベルも設定していなかったので、
    CloudWatch に `START` / `END` / `REPORT` しか残らず、何が適用されたか追えなかった。
    """
    monkeypatch.setenv("MIGRATE_DATABASE_DSN", "postgres://user:pw@direct-host.example.com/db")
    get_settings.cache_clear()

    def _fake_upgrade(config: migrate.Config, revision: str) -> None:
        # alembic 本体が適用のたびに出すログ（`alembic.runtime.migration`, INFO）の代わり
        logging.getLogger("alembic.runtime.migration").info(
            "Running upgrade old-revision -> new-revision"
        )

    monkeypatch.setattr(migrate.command, "upgrade", _fake_upgrade)
    monkeypatch.setattr(
        migrate, "_read_db_revision", _fake_db_revisions("old-revision", "new-revision")
    )
    # Lambda のランタイムと同じ状態（root にハンドラーがあり、レベルは既定の WARNING）
    root = logging.getLogger()
    runtime_handler = _ListHandler()
    root.addHandler(runtime_handler)
    root.setLevel(logging.WARNING)
    logging.getLogger("sanposcape").setLevel(logging.NOTSET)
    logging.getLogger("alembic").setLevel(logging.NOTSET)
    try:
        migrate.handler({}, None)
    finally:
        root.removeHandler(runtime_handler)

    messages = [record.getMessage() for record in runtime_handler.records]
    assert "Running upgrade old-revision -> new-revision" in messages
    assert "migration completed: before=old-revision head=new-revision" in messages


def test_importing_the_module_switches_runtime_handlers_to_json_in_lambda(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """migrate Lambda も api.py と同じく、ランタイムのログハンドラーを JSON にする（SS-180）。"""
    import importlib.util
    import logging
    import sys

    from sanposcape.core.observability import JsonLogFormatter

    monkeypatch.setenv("AWS_LAMBDA_FUNCTION_NAME", "sanposcape-dev-backend-migrate")
    runtime_handler = logging.NullHandler()
    runtime_handler.setFormatter(logging.Formatter("[%(levelname)s]\t%(message)s"))
    root = logging.getLogger()
    root.addHandler(runtime_handler)
    # pytest が root に付けているハンドラーの書式も書き換わるので、後で戻す
    saved = {handler: handler.formatter for handler in root.handlers}
    spec = importlib.util.find_spec("sanposcape.aws_lambda.migrate")
    assert spec is not None and spec.loader is not None
    fresh = importlib.util.module_from_spec(spec)
    alias = "sanposcape._aws_lambda_migrate_logging_probe"
    sys.modules[alias] = fresh
    try:
        spec.loader.exec_module(fresh)
        assert isinstance(runtime_handler.formatter, JsonLogFormatter)
    finally:
        sys.modules.pop(alias, None)
        root.removeHandler(runtime_handler)
        for handler, formatter in saved.items():
            handler.setFormatter(formatter)
