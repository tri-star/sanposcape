"""マイグレーション専用の Lambda ハンドラ（`alembic upgrade head` を実行する）。

API 本体のハンドラでは走らせない: コールドスタートのたびに走ると同時実行で競合し、
失敗時にヘルスチェックまで巻き込む
（docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md 決定9）。
同一スタック内の別 Lambda として、API 本体と同じビルド成果物（同じ CodeUri）を使い、
手動 invoke で実行する。これによりデプロイされたコードとマイグレーションのリビジョンが
必ず一致する。

★ direct（非 pooled）DSN を使う。Neon 公式は pooled 接続（PgBouncer transaction mode）を
使ってはいけない用途として Schema migrations を明示している（`SET search_path` などの
セッションレベルの機能がトランザクションごとにリセットされるため）。API 本体は
`neon_dsn`（pooled）を使うが、このハンドラは `neon_dsn_unpooled`（direct）を使う
（docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md 決定9）。

`alembic.ini` の `script_location = alembic` / `prepend_sys_path = src` は zip 成果物では
パス構成が変わって効かないため、ここでは `alembic.config.Config` をプログラム的に
組み立てる（`script_location` を `/var/task/alembic` の絶対パスで指定する）。
`alembic/env.py` は無変更のまま通る。
"""

import logging
from typing import Any

from alembic import command
from alembic.config import Config
from alembic.script import ScriptDirectory

from sanposcape.config import get_settings
from sanposcape.core.runtime_config import (
    hydrate_environment_from_secret,
    hydrate_migration_environment_from_secret,
)

logger = logging.getLogger(__name__)

# Makefile が alembic/ を Lambda の CWD（/var/task）へコピーする。
# ★ コピー先が `alembic` ではないのは、pip が PyPI の `alembic` パッケージを
#   `/var/task/alembic` に展開しており、同名にすると成果物が `/var/task/alembic/alembic/`
#   に潜り込んでしまうため（Makefile の build-Api のコメント参照）。
_ALEMBIC_SCRIPT_LOCATION = "/var/task/alembic_migrations"


class MigrationConfigError(Exception):
    """マイグレーション実行に必要な設定が揃っていない（実行前ガード）。"""


def _build_alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", _ALEMBIC_SCRIPT_LOCATION)
    config.set_main_option("sqlalchemy.url", database_url)
    return config


def handler(event: dict[str, Any], context: object) -> dict[str, str]:
    """`alembic upgrade head` を実行し、適用後の head リビジョンを返す。

    `aws lambda invoke` の出力（戻り値の JSON）でリビジョンを確認できるようにする。
    """
    hydrate_environment_from_secret()
    hydrate_migration_environment_from_secret()

    database_url = get_settings().migrate_database_url
    if database_url is None:
        raise MigrationConfigError(
            "migrate_database_dsn (MIGRATE_DATABASE_DSN) is not set; the secret may be "
            "missing 'neon_dsn_unpooled'. Migrations require a direct (non-pooled) "
            "connection and must not fall back to the pooled DATABASE_DSN. "
            "See docs/deployment.md section 5.1 (neon_dsn_unpooled)."
        )

    config = _build_alembic_config(database_url)
    command.upgrade(config, "head")

    head_revision = ScriptDirectory.from_config(config).get_current_head()
    logger.info("migration completed: head=%s", head_revision)
    return {"head": head_revision or ""}
