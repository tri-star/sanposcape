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
組み立てる（`script_location` を `/var/task/alembic_migrations` の絶対パスで指定する）。
DB URL は `config.attributes` 経由で `alembic/env.py` に渡す（configparser の変数補間を
避けるため。`_build_alembic_config` の注記を参照）。
"""

import logging
from typing import Any
from urllib.parse import urlsplit

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


#: `alembic/env.py` が DB URL を受け取るキー。`config.attributes` は素の dict で
#: configparser を経由しないため、URL に `%` が含まれていても壊れない（下の注記参照）。
DATABASE_URL_ATTRIBUTE = "sqlalchemy_url"


def _build_alembic_config(database_url: str) -> Config:
    config = Config()
    config.set_main_option("script_location", _ALEMBIC_SCRIPT_LOCATION)
    # ★ `set_main_option("sqlalchemy.url", ...)` を使ってはいけない。
    #   alembic の Config は値を configparser に書き込むため、`%` が変数補間の記号として
    #   解釈される。Neon が生成するパスワードは URL エンコードされていることがあり
    #   （例: `!` → `%21`）、`ValueError: invalid interpolation syntax` で落ちる。
    #   `%%` へのエスケープでも回避できるが、エスケープ漏れが再発する余地を残すため、
    #   補間の対象にならない `config.attributes` で受け渡す。
    config.attributes[DATABASE_URL_ATTRIBUTE] = database_url
    return config


def _reject_pooled_endpoint(database_url: str) -> None:
    """pooled エンドポイントでのマイグレーション実行を拒否する。

    Neon の pooled ホストは `-pooler` を含む（`ep-xxx-pooler.<region>.aws.neon.tech`）。
    シークレットの `neon_dsn_unpooled` に誤って pooled の DSN が入っていると、
    マイグレーションが PgBouncer transaction mode で走る。`SET search_path` などの
    セッションレベルの機能がトランザクションごとにリセットされる一方、**単純な DDL は
    通ってしまう**ため、壊れていることに気付けないまま進んでしまう
    （実際に dev で `neon_dsn_unpooled` が pooled を指していた）。

    ここでのホスト名判定はあくまで**ガード**であり、pooled から direct の
    ホスト名を導出する用途には使わない（Neon の命名規則への依存を実装に持ち込まない、
    という ADR-005 決定9 の判断は維持する）。
    """
    host = urlsplit(database_url).hostname or ""
    if "-pooler" in host:
        raise MigrationConfigError(
            f"migrate DSN points at a pooled endpoint ({host}); migrations require a "
            "direct (non-pooled) connection. Fix the 'neon_dsn_unpooled' key in the "
            "secret so it uses the host without '-pooler'. "
            "See docs/deployment.md section 5.1 (neon_dsn_unpooled)."
        )


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

    _reject_pooled_endpoint(database_url)

    config = _build_alembic_config(database_url)
    command.upgrade(config, "head")

    head_revision = ScriptDirectory.from_config(config).get_current_head()
    logger.info("migration completed: head=%s", head_revision)
    return {"head": head_revision or ""}
