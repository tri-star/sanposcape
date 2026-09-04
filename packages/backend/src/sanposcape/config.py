import logging
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

# 非本番環境で AUTH_JWT_SECRET が未設定のときに使うダミー鍵。
# 本番でこの値が使われることはない（起動時バリデーションで別途弾く）。
_INSECURE_DEV_JWT_SECRET = "insecure-local-development-secret-do-not-use-in-prod"


def _to_sqlalchemy_url(dsn: str) -> str:
    """Neon 等が払い出す DSN 文字列を SQLAlchemy + psycopg3 用の URL に正規化する。

    1. `postgres://` / `postgresql://` を `postgresql+psycopg://` へ書き換える
       （既に `+driver` が指定されている場合は触らない）。
    2. `sslmode` クエリパラメータが無ければ `sslmode=require` を補う（Neon は SSL 必須）。
    3. それ以外のクエリパラメータ（`channel_binding` 等）は素通しする。

    ★ DSN にはユーザー名・パスワードが含まれる。この関数は例外を送出しない
      （送出する変更を加える場合も、メッセージに DSN を含めないこと）。
    """
    parsed = urlsplit(dsn)
    scheme = "postgresql+psycopg" if parsed.scheme in ("postgres", "postgresql") else parsed.scheme
    query_params = parse_qsl(parsed.query, keep_blank_values=True)
    if not any(key == "sslmode" for key, _ in query_params):
        query_params.append(("sslmode", "require"))
    return urlunsplit(
        (scheme, parsed.netloc, parsed.path, urlencode(query_params), parsed.fragment)
    )


class Settings(BaseSettings):
    """環境変数から読み込むアプリ設定（pydantic-settings で型安全に）。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_host: str = "db"
    db_port: int = 5432
    db_user: str = "app"
    db_password: str = "password"
    db_name: str = "app"
    test_db_name: str = "app_test"

    # DSN 文字列を直接受ける経路（Lambda ではシークレットの `neon_dsn`（pooled）をここへ写す）。
    # 空文字なら従来どおり上の db_* から組み立てる（`database_url` 参照）。
    # local/test 以外では必須（下の `_validate_environment_settings` 参照）。
    database_dsn: str = ""
    # マイグレーション専用の direct（非pooled）DSN。Neon 公式は pooled 接続（PgBouncer
    # transaction mode）を使ってはいけない用途として Schema migrations を明示している
    # （`SET search_path` などセッションレベルの機能がトランザクションごとにリセットされるため）。
    # シークレットの `neon_dsn_unpooled` をここへ写す（`core/runtime_config.py` の
    # `hydrate_migration_environment_from_secret()`）。API 本体は使わない値なので、
    # 上の `database_dsn` とは異なり `_validate_environment_settings` の必須チェックには
    # 含めない（API Lambda のコールドスタートを `neon_dsn_unpooled` 未投入で失敗させないため。
    # 欠けている場合は `aws_lambda/migrate.py` が実行前ガードで明示的に失敗させる。
    # tmp/SS-67/handover-notes.md M-2）。
    migrate_database_dsn: str = ""
    # 接続プール設定。既定値は SQLAlchemy 標準相当（pool_size=5 / max_overflow=10）で
    # ローカル/CI の挙動は変えない。Lambda では pool_size=1 / max_overflow=0 に絞り、
    # Neon への同時接続数を `ReservedConcurrentExecutions` と合わせて有界化する
    # （tmp/SS-67/backend-plan.md 決定5）。
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=10, ge=0)
    db_pool_recycle_seconds: int = Field(default=280, ge=1)
    # psycopg3 は既定で prepared statement を自動生成する（`prepare_threshold=5`）。
    # Neon の PgBouncer（pooled 接続）はプロトコルレベルの prepared statement に対応済みのため
    # 通常は無効化不要だが、"prepared statement ... already exists" 系のエラーが実際に
    # 出た場合のフォールバックとして無効化できるようにしておく（docs/deployment.md 参照）。
    # ★ psycopg3 の生の意味では `prepare_threshold=0` は「初回実行から即座に prepare する」で
    #   あり「無効化」ではない（意味が逆）。読み手の誤読を避けるため bool 名にしている
    #  （tmp/SS-67/handover-notes.md M-3）。
    db_disable_prepared_statements: bool = False

    # --- 実行環境 ---
    # AWS 側のスタックパラメータ `Env`(dev/prod) はこの `env` とは別物で、SAM テンプレートの
    # Mappings で Env=dev→ENV=staging / Env=prod→ENV=production に変換して渡す。
    # `Literal` に "dev"/"prod" を追加しない（許可リスト方式の fail-safe を壊さないため。
    # 過去に staging が抜けて認証バイパスになった経緯があり、値域を安易に増やすと同じ罠を
    # 再演するリスクがある。tmp/SS-67/backend-plan.md 決定4 / docs/deployment.md）。
    env: Literal["local", "test", "staging", "production"] = "local"

    # --- 認証モード（ADR-002 決定4。既定は fail-safe な real） ---
    auth_mode: Literal["real", "dev"] = "real"

    # --- 自前セッショントークン ---
    auth_jwt_secret: str = ""  # HS256 の対称鍵。production では必須（32文字以上）
    auth_token_issuer: str = "sanposcape"
    auth_token_audience: str = "sanposcape-api"
    auth_access_token_ttl_seconds: int = 900  # 15分（mobile 想定 5〜15分）
    auth_refresh_token_ttl_days: int = 30

    # --- Google ID token 検証 ---
    # NoDecode: pydantic-settings は既定で list[str] を環境変数から JSON としてパースしようとする。
    # `GOOGLE_ALLOWED_AUDIENCES=aaa,bbb` のようなカンマ区切りを書くと JSON デコードに失敗し、
    # 下の `_split_csv` バリデータに到達する前に SettingsError で起動が落ちる。
    # NoDecode を付けて自動 JSON デコードを無効化し、生の文字列を素通しさせる。
    google_allowed_audiences: Annotated[list[str], NoDecode] = []  # Android=Web ID / iOS=iOS ID
    google_jwks_url: str = "https://www.googleapis.com/oauth2/v3/certs"
    google_allowed_issuers: Annotated[list[str], NoDecode] = [
        "https://accounts.google.com",
        "accounts.google.com",
    ]
    google_jwks_cache_lifespan_seconds: int = 3600

    # --- Maps provider モード（ADR-002 決定4 と同じ fail-safe 方針。既定は real） ---
    # fake = ネットワークを使わない決定的な provider（Maestro E2E / キー未所持の開発者用）。
    # ENV=local / test 以外で fake を選ぶと下の許可リスト検証で起動に失敗する。
    maps_mode: Literal["real", "fake"] = "real"

    # --- Google Maps Platform (server-side only) ---
    google_maps_server_api_key: str = ""
    google_maps_connect_timeout_seconds: float = Field(default=3.0, gt=0)
    google_maps_read_timeout_seconds: float = Field(default=8.0, gt=0)
    google_maps_search_deadline_seconds: float = Field(default=10.0, gt=0)
    google_maps_cache_ttl_seconds: int = Field(default=300, gt=0)
    google_maps_cache_max_entries: int = Field(default=256, gt=0)
    # Nearby Search (New) supports at most 20 results; enforce the provider boundary here.
    google_maps_max_place_candidates: int = Field(default=20, ge=1, le=20)
    google_maps_max_route_requests_per_search: int = Field(default=20, ge=1, le=20)
    google_maps_rate_limit_requests: int = Field(default=30, gt=0)
    google_maps_anonymous_rate_limit_requests: int = Field(default=10, gt=0)
    google_maps_rate_limit_window_seconds: int = Field(default=60, gt=0)
    google_maps_explore_request_max_bytes: int = Field(default=32_768, gt=0, le=1_048_576)

    # --- walks ---
    # 軌跡は最大で数百KBになり得るため /explore より大きい上限にするが、無制限にはしない
    # （低コスト DoS 対策）。
    walks_request_max_bytes: int = Field(default=1_048_576, gt=0, le=4_194_304)

    @field_validator("google_allowed_audiences", "google_allowed_issuers", mode="before")
    @classmethod
    def _split_csv(cls, v: object) -> object:
        """`.env` のカンマ区切り記法（GOOGLE_ALLOWED_AUDIENCES=aaa,bbb）を受け付ける。
        `list[str]` フィールドの既定では JSON パースが必要になり、カンマ区切りだと
        SettingsError で起動に失敗するため（NoDecode と併用して回避）。
        """
        if isinstance(v, str):
            return [s.strip() for s in v.split(",") if s.strip()]
        return v

    @model_validator(mode="after")
    def _validate_environment_settings(self) -> "Settings":
        if self.google_maps_anonymous_rate_limit_requests > self.google_maps_rate_limit_requests:
            raise ValueError(
                "GOOGLE_MAPS_ANONYMOUS_RATE_LIMIT_REQUESTS must not exceed "
                "GOOGLE_MAPS_RATE_LIMIT_REQUESTS"
            )
        # 許可リスト方式: 「fail-safe な検証をスキップしてよい環境」だけを明示的に列挙する。
        # `env == "production"` のような否定リスト方式だと、新しい env 値（例: staging）を
        # 追加した瞬間にバリデーションの対象外へ静かに落ちてしまう
        # （実際に staging がこの罠を踏み、AUTH_JWT_SECRET 未設定時にリポジトリ内の固定文字列が
        # 署名鍵になり、AUTH_MODE=dev も阻止されないという認証バイパスの脆弱性になっていた）。
        if self.env not in ("local", "test"):
            if self.auth_mode != "real":
                raise ValueError(f"AUTH_MODE must be 'real' when ENV={self.env}")
            if self.maps_mode != "real":
                raise ValueError(f"MAPS_MODE must be 'real' when ENV={self.env}")
            if len(self.auth_jwt_secret) < 32:
                raise ValueError(f"AUTH_JWT_SECRET must be set (>=32 chars) when ENV={self.env}")
            if not self.google_allowed_audiences:
                raise ValueError(f"GOOGLE_ALLOWED_AUDIENCES must be set when ENV={self.env}")
            if not self.google_maps_server_api_key:
                raise ValueError(f"GOOGLE_MAPS_SERVER_API_KEY must be set when ENV={self.env}")
            if not self.database_dsn:
                # DSN 未設定のまま起動すると、Lambda では既定の db_host（`db:5432`）へ
                # 接続を試みて 29 秒タイムアウトし続ける最悪の失敗モードになる。
                raise ValueError(f"DATABASE_DSN must be set when ENV={self.env}")
        elif not self.auth_jwt_secret:
            # 非本番はゼロ設定でも動かせるようダミー鍵にフォールバックする（決定1）。
            # 本番安全性は上記のバリデーションで別途担保する。
            logger.warning(
                "AUTH_JWT_SECRET is not set; falling back to an insecure development secret. "
                "This must never happen in production."
            )
            self.auth_jwt_secret = _INSECURE_DEV_JWT_SECRET
        return self

    @property
    def database_url(self) -> str:
        """SQLAlchemy に渡す DB 接続 URL。`database_dsn` が設定されていれば優先する。

        `database_url` はフィールドではなく property のまま維持している。
        同名の pydantic フィールドは property と共存できないため、DSN は
        `database_dsn` という別名フィールドで受ける（呼び出し側の書き方を変えないため）。
        """
        if self.database_dsn:
            return _to_sqlalchemy_url(self.database_dsn)
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def test_database_url(self) -> str:
        """テスト用 DB の接続 URL。`database_dsn` の影響を受けない（常に db_* から組み立てる）。

        テスト用 DB の接続先がシークレット由来の DSN になることは絶対に無いようにする
        （誤って本番 DB のスキーマを作り直す/dropする事故を構造的に防ぐため）。
        """
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.test_db_name}"
        )

    @property
    def migrate_database_url(self) -> str | None:
        """マイグレーション用の direct DB 接続 URL。`migrate_database_dsn` 未設定なら `None`。

        `database_url` と違い db_* へのフォールバックを持たない（ローカル開発の
        `alembic upgrade head` は引き続き `database_url`（= db_* から組み立てた URL）を使う。
        `alembic/env.py` は無変更）。この property は `aws_lambda/migrate.py` 専用。
        """
        if not self.migrate_database_dsn:
            return None
        return _to_sqlalchemy_url(self.migrate_database_dsn)

    @property
    def sqlalchemy_engine_kwargs(self) -> dict[str, object]:
        """`create_engine()` に渡す共通のキーワード引数。"""
        connect_args: dict[str, object] = {"connect_timeout": 5}
        if self.db_disable_prepared_statements:
            connect_args["prepare_threshold"] = None
        return {
            "pool_size": self.db_pool_size,
            "max_overflow": self.db_max_overflow,
            "pool_pre_ping": True,
            "pool_recycle": self.db_pool_recycle_seconds,
            "connect_args": connect_args,
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()
