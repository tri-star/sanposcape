import logging
from functools import lru_cache
from typing import Annotated, Literal

from pydantic import Field, field_validator, model_validator
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
