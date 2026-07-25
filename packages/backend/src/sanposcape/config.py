import logging
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

logger = logging.getLogger(__name__)

# 非本番環境で AUTH_JWT_SECRET が未設定のときに使うダミー鍵。
# 本番でこの値が使われることはない（起動時バリデーションで別途弾く）。
_INSECURE_DEV_JWT_SECRET = "insecure-local-development-secret-do-not-use-in-prod"


class Settings(BaseSettings):
    """環境変数から読み込むアプリ設定（pydantic-settings で型安全に）。"""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_host: str = "db"
    db_port: int = 5432
    db_user: str = "app"
    db_password: str = "password"
    db_name: str = "app"
    test_db_name: str = "app_test"

    # --- 実行環境 ---
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
    def _validate_auth_settings(self) -> "Settings":
        if self.env == "production":
            if self.auth_mode != "real":
                raise ValueError("AUTH_MODE must be 'real' when ENV=production")
            if len(self.auth_jwt_secret) < 32:
                raise ValueError("AUTH_JWT_SECRET must be set (>=32 chars) in production")
            if not self.google_allowed_audiences:
                raise ValueError("GOOGLE_ALLOWED_AUDIENCES must be set in production")
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
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.db_name}"
        )

    @property
    def test_database_url(self) -> str:
        return (
            f"postgresql+psycopg://{self.db_user}:{self.db_password}"
            f"@{self.db_host}:{self.db_port}/{self.test_db_name}"
        )


@lru_cache
def get_settings() -> Settings:
    return Settings()
