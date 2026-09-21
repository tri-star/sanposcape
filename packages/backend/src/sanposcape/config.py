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
    # docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md 決定9）。
    migrate_database_dsn: str = ""
    # 接続プール設定。既定値は SQLAlchemy 標準相当（pool_size=5 / max_overflow=10）で
    # ローカル/CI の挙動は変えない。Lambda では pool_size=1 / max_overflow=0 に絞り、
    # Neon への同時接続数を `ReservedConcurrentExecutions` と合わせて有界化する
    # （docs/deployment.md §9 Neon 接続設定）。
    db_pool_size: int = Field(default=5, ge=1)
    db_max_overflow: int = Field(default=10, ge=0)
    db_pool_recycle_seconds: int = Field(default=280, ge=1)
    # psycopg3 は既定で prepared statement を自動生成する（`prepare_threshold=5`）。
    # Neon の PgBouncer（pooled 接続）はプロトコルレベルの prepared statement に対応済みのため
    # 通常は無効化不要だが、"prepared statement ... already exists" 系のエラーが実際に
    # 出た場合のフォールバックとして無効化できるようにしておく（docs/deployment.md 参照）。
    # ★ psycopg3 の生の意味では `prepare_threshold=0` は「初回実行から即座に prepare する」で
    #   あり「無効化」ではない（意味が逆）。読み手の誤読を避けるため bool 名にしている
    #  （docs/deployment.md §9 Neon 接続設定）。
    db_disable_prepared_statements: bool = False

    # --- 実行環境 ---
    # AWS 側のスタックパラメータ `Env`(dev/prod) はこの `env` とは別物で、SAM テンプレートの
    # Mappings で Env=dev→ENV=staging / Env=prod→ENV=production に変換して渡す。
    # `Literal` に "dev"/"prod" を追加しない（許可リスト方式の fail-safe を壊さないため。
    # 過去に staging が抜けて認証バイパスになった経緯があり、値域を安易に増やすと同じ罠を
    # 再演するリスクがある
    # （docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md 決定6 /
    # docs/deployment.md）。
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

    # --- フィーチャーフラグモード（ADR-002 決定4 と同じ fail-safe 方針。既定は real） ---
    # real = AWS AppConfig（boto3 appconfigdata）から実際に取得する。
    # stub = ネットワークを一切使わず FEATURE_FLAG_STUB_DOCUMENT を返す（ローカル開発 / テスト用）。
    # ENV=local / test 以外で stub を選ぶと下の許可リスト検証で起動に失敗する。
    # ADR-008 決定2 / SS-98。
    feature_flag_mode: Literal["real", "stub"] = "real"
    # stub モードで返す文書。`GetLatestConfiguration` が返す簡略 JSON と同じ形にする
    # （integrations/aws/appconfig.py の同じパーサを本番と共有するため）。
    # 型は str（dict にすると pydantic-settings の自動 JSON デコードが絡み、
    # GOOGLE_ALLOWED_AUDIENCES で踏んだ「パース失敗で起動できない」罠を再演しうる）。
    # パースは取得層で行い、失敗しても起動は落とさず警告 + 空ドキュメントにする。
    feature_flag_stub_document: str = ""
    # AppConfig の ID（SS-94 の SSM 契約から deploy 時に渡される）。1本でも空なら
    # UnconfiguredFlagSource（AWS を一切呼ばない安全既定）にフォールバックする。
    appconfig_application_id: str = ""
    appconfig_environment_id: str = ""
    appconfig_configuration_profile_id: str = ""
    appconfig_poll_interval_seconds: int = Field(default=60, ge=15, le=86_400)
    appconfig_error_backoff_seconds: int = Field(default=30, ge=1, le=3_600)
    appconfig_connect_timeout_seconds: float = Field(default=1.0, gt=0)
    appconfig_read_timeout_seconds: float = Field(default=2.0, gt=0)

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
    # 周回ルート（SS-33, ADR-007）の kill switch。品質劣化時の緊急停止と、mobile の
    # 同じ道フォールバック表示の手動確認に使う（real/fake いずれでも有効）。
    google_maps_loop_route_enabled: bool = True
    # 周回ルート1リクエスト全体（並列2候補＋両候補失敗時の同じ道フォールバックの単発取得まで
    # 含む）の時間予算。1候補あたりの上限ではない。各候補は
    # `min(google_maps_read_timeout_seconds, google_maps_route_deadline_seconds)` で打ち切り、
    # 単発フォールバックは残り予算（`deadline - 経過時間`）で判定する（無ければ503）。Lambda の
    # Timeout（29秒）より十分短くする（docs/adr/ADR-005-backend-serverless-deployment-...）。
    google_maps_route_deadline_seconds: float = Field(default=12.0, gt=0, le=25)

    # --- walks ---
    # 軌跡は最大で数百KBになり得るため /explore より大きい上限にするが、無制限にはしない
    # （低コスト DoS 対策）。
    walks_request_max_bytes: int = Field(default=1_048_576, gt=0, le=4_194_304)

    # --- pins（写真ストレージ, SS-88）---
    # real = S3 に実際に接続する。fake = プロセス内メモリ + backend 自身の /dev-storage/*
    # （ローカル開発・E2E 用。ENV=local/test 以外で fake を選ぶと起動失敗、既存の
    # AUTH_MODE/MAPS_MODE/FEATURE_FLAG_MODE と同じ fail-safe 方針）。
    storage_mode: Literal["real", "fake"] = "real"
    # 空文字なら UnconfiguredObjectStorage（写真 API は 503）。デプロイ先では template.yaml が
    # SSM（pin_photos/bucket_name）から渡す（SS-108）。
    pin_photo_bucket_name: str = ""
    pin_photo_bucket_region: str = "ap-southeast-1"
    # 1枚あたりの上限（ユーザー決定 B-Y3）。content-length-range・413・確定時の検証・GET に使う。
    pin_photo_max_bytes: int = Field(default=10 * 1024 * 1024, ge=1_048_576, le=20 * 1024 * 1024)
    # アップロード者ごとの合計上限（ユーザー決定 B-Y5）。原本のみ計上（サムネイルは含めない）。
    pin_photo_user_quota_bytes: int = Field(default=1024**3, gt=0)
    # decompression bomb 対策（Pillow の Image.MAX_IMAGE_PIXELS に使う）。
    pin_photo_max_pixels: int = Field(default=40_000_000, gt=0)
    # 未紐付けの枠（pending）の同時保有数の上限。超えると 429（連打による容量の先食い防止）。
    pin_photo_max_pending_uploads: int = Field(default=30, ge=1, le=200)
    # presigned POST（アップロード）の有効期限。
    pin_photo_upload_url_ttl_seconds: int = Field(default=600, ge=60, le=900)
    # 枠を確定（POST /pins 等での紐付け）に使える期限。staging の S3 ライフサイクル
    # （最短約24時間）より十分短くする。
    pin_photo_upload_attach_ttl_seconds: int = Field(default=21_600, ge=300, le=64_800)
    # サムネイル等の presigned GET の有効期限（上限値。実際は署名した Lambda の一時認証情報の
    # 寿命より長くは有効でない）。
    pin_photo_download_url_ttl_seconds: int = Field(default=3600, ge=60, le=43_200)
    pin_photo_thumbnail_max_edge_px: int = Field(default=512, ge=64, le=2048)
    pin_photo_thumbnail_jpeg_quality: int = Field(default=80, ge=30, le=95)
    # 写真の確定処理（検証・サムネイル生成・Copy）全体の時間予算。CloudFront 30秒・Lambda
    # 29秒より手前で打ち切り、503（再送で回復）にする。
    pin_photo_confirm_deadline_seconds: int = Field(default=20, ge=1, le=25)
    pin_photo_confirm_concurrency: int = Field(default=3, ge=1, le=8)
    object_storage_connect_timeout_seconds: float = Field(default=2.0, gt=0)
    object_storage_read_timeout_seconds: float = Field(default=5.0, gt=0)
    # /pins・/pin-photo-uploads の本文上限（軌跡を含まないので walks より小さい）。
    pins_request_max_bytes: int = Field(default=16_384, gt=0, le=65_536)

    @property
    def dev_storage_request_max_bytes(self) -> int:
        """`STORAGE_MODE=fake` 専用の `/dev-storage/uploads` の本文上限（PR #93 T2）。

        `pin_photo_max_bytes`（写真本体）に multipart の付随フィールド
        （`key`/`Content-Type`/`x-fake-*` と boundary 諸々）の余裕を足す。
        `file.read()` が本文全体を検証前にメモリへ読み込むため、この経路が
        `RequestSizeLimitMiddleware` の対象外だと巨大な body で任意にメモリを
        消費させられる（本番には存在しない router だが、local/test で有効）。
        """
        return self.pin_photo_max_bytes + 64 * 1024

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
            if self.feature_flag_mode != "real":
                raise ValueError(f"FEATURE_FLAG_MODE must be 'real' when ENV={self.env}")
            if self.storage_mode != "real":
                raise ValueError(f"STORAGE_MODE must be 'real' when ENV={self.env}")
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
