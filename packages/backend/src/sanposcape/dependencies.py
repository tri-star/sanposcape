"""横断的な FastAPI 依存をまとめるモジュール。

DB セッション供給に加え、認証済みユーザーを取得する。
"""

import uuid

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from sanposcape.auth.exceptions import InvalidAccessTokenError, MalformedAuthorizationHeaderError
from sanposcape.auth.headers import extract_bearer_token
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


def _authenticate_access_token(
    access_token: str,
    user_service: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> User:
    """access token を検証し、認証済みユーザーを返す。"""

    try:
        claims = decode_access_token(access_token, settings)
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


def get_current_user_optional(
    request: Request,
    user_service: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> User | None:
    """認証ヘッダーがない場合だけ ``None``、それ以外は token を検証する。

    探索 API を OpenAPI 上も公開 endpoint として表現するため、ここでは
    ``HTTPBearer`` を依存に含めずリクエストヘッダーを直接読む。不正なヘッダーを
    匿名利用へフォールバックさせないため、ヘッダーがある認証失敗は常に 401 にする。
    ヘッダーの取り出しは ``X-App-Authorization`` → ``Authorization`` の優先順で読む
    ``extract_bearer_token()`` に委譲している（CloudFront OAC がビューアの
    ``Authorization`` を上書きするため。決定9）。
    """
    try:
        access_token = extract_bearer_token(request)
    except MalformedAuthorizationHeaderError as exc:
        raise _unauthorized() from exc
    if access_token is None:
        return None
    return _authenticate_access_token(access_token, user_service, settings)


def get_current_user(
    request: Request,
    _credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    user_service: UserService = Depends(get_user_service),
    settings: Settings = Depends(get_settings),
) -> User:
    """認証必須 API 用に access token を検証する。

    ``_credentials``（``HTTPBearer`` 経由）は OpenAPI の security スキーム表現
    （``operation["security"] == [{"HTTPBearer": []}]``）を維持するためだけに依存として
    残しており、実際の値は使わない。実際のトークン取り出しは
    ``X-App-Authorization`` → ``Authorization`` の優先順で読む
    ``extract_bearer_token()`` を使う（決定9）。
    """
    try:
        access_token = extract_bearer_token(request)
    except MalformedAuthorizationHeaderError as exc:
        raise _unauthorized() from exc
    if access_token is None:
        raise _unauthorized()
    return _authenticate_access_token(access_token, user_service, settings)


__all__ = ["get_current_user", "get_current_user_optional", "get_db"]
