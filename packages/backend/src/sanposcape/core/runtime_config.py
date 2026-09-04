"""シークレット JSON を環境変数へ写す起動時ハイドレーション（横断的関心事）。

Lambda はシークレットの値を実行時に Secrets Manager から取得する必要があるが、
`config.py` は folder-structure.md の方針（外部API連携は `integrations/` に隔離する）に
従い boto3 のような外部 SDK に依存させない。このモジュールがその橋渡しを担う。

`core/` に置く理由: 「どのシークレットキーをどの環境変数に写すか」はどのドメインにも
属さない起動時の土台であり、`core/` の定義（ドメイン横断の仕組みを置く場所）に合致する。
`core → integrations` の依存は「`core` はドメインを import しない」という既存ルールに
反しない（`integrations/` もドメインではない）。
"""

import logging
import os

from sanposcape.config import get_settings
from sanposcape.integrations.aws.secrets import get_secret_json

logger = logging.getLogger(__name__)

# シークレット JSON のキー → 環境変数名のマッピング。
# `google_oauth_client_secret` は backend では未使用（ADR-002 の public client 方式）なので
# 意図的にここへ含めない（tmp/SS-67/handover-notes.md 参照）。
SECRET_KEY_TO_ENV: dict[str, str] = {
    "neon_dsn": "DATABASE_DSN",
    "jwt_signing_key": "AUTH_JWT_SECRET",
    "google_oauth_client_id": "GOOGLE_ALLOWED_AUDIENCES",
    "google_maps_server_api_key": "GOOGLE_MAPS_SERVER_API_KEY",
}

# マイグレーション Lambda 専用のマッピング。意図的に `SECRET_KEY_TO_ENV` へ含めない:
# 含めてしまうと API Lambda のコールドスタートのたびに「まだ投入されていないキー」として
# ERROR ログが出てしまう（`neon_dsn_unpooled` は tmp/SS-67/handover-notes.md M-2 のとおり
# Phase 4 までにシークレットへ追加投入される予定で、それまでは欠けているのが正常な状態）。
# migrate Lambda（`aws_lambda/migrate.py`）だけが `hydrate_migration_environment_from_secret()`
# を呼ぶことで、この鍵の要否をその呼び出し元に閉じ込める。
MIGRATE_SECRET_KEY_TO_ENV: dict[str, str] = {
    "neon_dsn_unpooled": "MIGRATE_DATABASE_DSN",
}


def _hydrate(secret: dict[str, str], mapping: dict[str, str]) -> None:
    """`mapping` に従って `secret` の値を `os.environ` へ書き込む共通処理。

    既に環境変数が設定されている項目は上書きしない（明示設定を優先する）。
    """
    for secret_key, env_name in mapping.items():
        if secret_key not in secret:
            continue
        if env_name in os.environ:
            continue
        os.environ[env_name] = secret[secret_key]


def hydrate_environment_from_secret() -> None:
    """`APP_SECRET_ARN` が指すシークレットを取得し、`SECRET_KEY_TO_ENV` に従って
    `os.environ` へ書き込む。

    - `APP_SECRET_ARN` が未設定なら何もしない（no-op）。ローカル開発 / ECS
      （タスク定義の `secrets` で環境変数が事前に注入される）/ 単体テストで
      安全に呼び出せるようにするための設計（tmp/SS-67/backend-plan.md 決定1）。
    - 既に環境変数が設定されている項目は上書きしない（明示設定を優先する）。
    - 取得できたキー名のリストを INFO ログに出す（値は絶対に出さない）。
    - `SECRET_KEY_TO_ENV` に対して欠けているキーがあれば、キー名だけを ERROR ログに出す。
    - 最後に `get_settings.cache_clear()` を呼ぶ。これにより、この関数を呼ぶより前に
      誰かが `get_settings()` を触っていた場合でも、キャッシュされた古い `Settings` が
      残らない。
    """
    secret_arn = os.environ.get("APP_SECRET_ARN")
    if not secret_arn:
        return

    secret = get_secret_json(secret_arn)
    logger.info("secret loaded: keys=%s", sorted(secret.keys()))

    missing_keys = sorted(key for key in SECRET_KEY_TO_ENV if key not in secret)
    if missing_keys:
        logger.error("secret is missing expected keys: %s", missing_keys)

    _hydrate(secret, SECRET_KEY_TO_ENV)
    get_settings.cache_clear()


def hydrate_migration_environment_from_secret() -> None:
    """migrate Lambda 専用: `neon_dsn_unpooled`（direct DSN）を `MIGRATE_DATABASE_DSN` へ写す。

    `hydrate_environment_from_secret()` とは独立して呼ぶ（`aws_lambda/migrate.py` からのみ
    呼ばれる想定）。キーが欠けていても例外は送出しない。欠けている場合の実行時ガードは
    `Settings.migrate_database_url is None` を見る呼び出し側（`aws_lambda/migrate.py`）の責務。
    """
    secret_arn = os.environ.get("APP_SECRET_ARN")
    if not secret_arn:
        return

    secret = get_secret_json(secret_arn)
    missing_keys = sorted(key for key in MIGRATE_SECRET_KEY_TO_ENV if key not in secret)
    if missing_keys:
        logger.error("secret is missing expected keys for migrations: %s", missing_keys)

    _hydrate(secret, MIGRATE_SECRET_KEY_TO_ENV)
    get_settings.cache_clear()
