import unicodedata
import uuid
from typing import Annotated, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# refresh token は `secrets.token_urlsafe(32)` で約43文字。将来のTTL変更等の余地を見て
# 余裕を持たせつつ、上限を設けて低コストDoS（巨大な文字列を送りつけてパース/デコードに
# CPU・メモリを浪費させる）を防ぐ（B-1）。
_REFRESH_TOKEN_MAX_LENGTH = 512
# Google / Apple の ID token（JWT）は claims の量に応じて長さが変わるが、通常は数KB以内
# （Apple は 1KB 前後）に収まる。4096文字あれば実運用の ID token を十分許容しつつ、
# 上限としては機能する。
_ID_TOKEN_MAX_LENGTH = 4096
# 16文字未満はエントロピー不足で nonce の意味が薄い。上限は ID token と同じ低コスト DoS 対策。
_NONCE_MIN_LENGTH = 16
_NONCE_MAX_LENGTH = 256
# Apple の authorization code。形式は公開されておらず、厳しくすると Apple 側の変更でサインイン自体が
# 422 になるので検証しない。上限は低コスト DoS 対策のみ（実測の code は 100 文字未満）。
_AUTHORIZATION_CODE_MAX_LENGTH = 512
# users.display_name の列幅。超えると DB の DataError（500）になるため入口で弾く。
SESSION_DISPLAY_NAME_MAX_LENGTH = 255
# 表示名に入れさせない Unicode カテゴリ。Cc（NUL・改行等）、Zl/Zp（行・段落区切り）、
# Cf（書式制御。bidi 上書きやゼロ幅文字による表示なりすまし）。
_DISPLAY_NAME_FORBIDDEN_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp"})
# Cf だが、絵文字の合字（ZWJ）や一部言語の正しい表記（ZWNJ）に必要なので許可する。
_DISPLAY_NAME_ALLOWED_FORMAT_CHARS = frozenset({"\u200d", "\u200c"})


class SessionCreate(BaseModel):
    provider: Literal["google", "apple"]
    id_token: str = Field(max_length=_ID_TOKEN_MAX_LENGTH)
    nonce: (
        Annotated[str, Field(min_length=_NONCE_MIN_LENGTH, max_length=_NONCE_MAX_LENGTH)] | None
    ) = Field(
        default=None,
        description=(
            "端末が生成した raw nonce。provider が apple のときは必須"
            "（Apple には SHA256 の hex を渡し、ここには raw を送る）。google では無視される。"
        ),
    )
    authorization_code: (
        Annotated[str, Field(min_length=1, max_length=_AUTHORIZATION_CODE_MAX_LENGTH)] | None
    ) = Field(
        default=None,
        description=(
            "Sign in with Apple の authorization code。provider が apple のときだけ使い、"
            "アカウント削除時にトークンを失効させるため Apple の refresh token に交換して保存する。"
            "省略可（省略時は交換しない）。交換に失敗してもサインインは失敗しない。"
            "code は 1 回限り・約 5 分で失効する。google では無視される。"
        ),
    )
    display_name: Annotated[str, Field(max_length=SESSION_DISPLAY_NAME_MAX_LENGTH)] | None = Field(
        default=None,
        description=(
            "ユーザーの表示名。ID token に氏名が無い場合だけ使う"
            "（Apple は初回の認可時だけ端末に氏名を返す）。保存済みの表示名は上書きせず、"
            "既存ユーザーでも未設定（null）の場合だけ補完する。"
            "前後の空白は除去され、空になった場合は未指定として扱う。"
            "制御文字・行区切り・書式制御文字（双方向制御やゼロ幅文字など。"
            "ZWJ・ZWNJ は除く）を含むと 422 になる。"
        ),
    )

    @field_validator("display_name", mode="before")
    @classmethod
    def _strip_and_blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip() or None
        return value

    @field_validator("display_name", mode="after")
    @classmethod
    def _reject_control_characters(cls, value: str | None) -> str | None:
        # NUL は PostgreSQL の text に入らず 500 になる。改行・タブ等も氏名としては不正。
        if value is not None and any(
            unicodedata.category(ch) in _DISPLAY_NAME_FORBIDDEN_CATEGORIES
            and ch not in _DISPLAY_NAME_ALLOWED_FORMAT_CHARS
            for ch in value
        ):
            raise ValueError("display_name must not contain control or invisible format characters")
        return value

    @model_validator(mode="after")
    def _require_nonce_for_apple(self) -> Self:
        if self.provider == "apple" and self.nonce is None:
            raise ValueError("nonce is required when provider is apple")
        return self


class SessionRefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=_REFRESH_TOKEN_MAX_LENGTH)


class SessionLogoutRequest(BaseModel):
    refresh_token: str = Field(max_length=_REFRESH_TOKEN_MAX_LENGTH)


class AuthUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    display_name: str | None
    photo_url: str | None


class SessionRead(BaseModel):
    access_token: str
    expires_in: int
    refresh_token: str
    user: AuthUserRead


class DevSessionCreate(BaseModel):
    """`AUTH_MODE=dev` 専用。OpenAPI には掲載しない（`dev_router.py` 側で制御）。"""

    user_key: str = Field(max_length=256)
