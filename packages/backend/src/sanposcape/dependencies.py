"""横断的な FastAPI 依存をまとめるモジュール。

DB セッション供給に加え、`get_current_user` で認証済みユーザーを取得する。
"""

import uuid

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from sanposcape.auth.exceptions import InvalidAccessTokenError
from sanposcape.auth.tokens import decode_access_token
from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.users.dependencies import get_user_service
from sanposcape.users.models import User
from sanposcape.users.service import UserService

# auto_error=False は必須。HTTPBearer(auto_error=True) はヘッダ欠落時に 403 を返してしまい、
# モバイルの「401 のときだけ refresh -> 1回リトライ」契約が壊れる。
_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=401,
        detail="Not authenticated",
        headers={"WWW-Authenticate": "Bearer"},
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    user_service: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> User:
    """access token を検証し、認証済みユーザーを返す。

    認証失敗（ヘッダ欠落・スキーム不正・署名不正・期限切れ・ユーザー不在）は
    すべて 401（`WWW-Authenticate: Bearer` 付き）に正規化する。403 は返さない。
    """
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()

    try:
        claims = decode_access_token(credentials.credentials, settings)
    except InvalidAccessTokenError as exc:
        raise _unauthorized() from exc

    try:
        user_id = uuid.UUID(claims.sub)
    except ValueError as exc:
        raise _unauthorized() from exc

    user = user_service.get_by_id(user_id)
    if user is None:
        raise _unauthorized()  # 削除済みユーザーのトークン
    return user


# TODO(SS-13): ゲスト対応に向けて get_current_user_optional を追加できる形にしておく。
# SS-10 では YAGNI のため未実装。

__all__ = ["get_current_user", "get_db"]
