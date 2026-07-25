import logging
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.auth.exceptions import (
    InvalidRefreshTokenError,
    RefreshTokenReuseDetectedError,
    UnsupportedProviderError,
)
from sanposcape.auth.providers.base import IdentityProvider, ProviderIdentity
from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.auth.tokens import create_access_token, generate_refresh_token, hash_refresh_token
from sanposcape.config import Settings
from sanposcape.users.models import User
from sanposcape.users.service import UserService

logger = logging.getLogger(__name__)


@dataclass
class SessionResult:
    access_token: str
    expires_in: int
    refresh_token: str
    user: User


def _assert_dev_mode(settings: Settings) -> None:
    """多層防御の4層目: router の include 漏れがあっても、ここで確実に弾く。"""
    if settings.auth_mode != "dev":
        raise RuntimeError("create_dev_session() called while AUTH_MODE != 'dev'")


class AuthService:
    """認証・セッションに関するユースケース。トランザクション境界を持つ。

    設計の中核（ADR-002 決定3）: `create_session`（real）と `create_dev_session`
    （dev）で異なるのは「Google ID token を検証して sub を得る」か「user_key から
    開発用ユーザーを引き当てる」かの入口だけ。`_resolve_user` / `_issue_session`
    は real/dev で同一メソッドを共有する。ここを分岐させてはいけない。
    """

    def __init__(
        self,
        db: Session,
        user_service: UserService,
        refresh_repo: RefreshTokenRepository,
        providers: dict[str, IdentityProvider],
        settings: Settings,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._db = db
        self._user_service = user_service
        self._refresh_repo = refresh_repo
        self._providers = providers
        self._settings = settings
        self._now = now

    # --- 入口（real） ---
    def create_session(self, provider: str, id_token: str) -> SessionResult:
        idp = self._providers.get(provider)
        if idp is None:
            raise UnsupportedProviderError(provider)
        identity = idp.verify(id_token)  # ← real 固有はここだけ
        user = self._resolve_user(identity)  # ← 共通
        result = self._issue_session(user)  # ← 共通
        self._db.commit()
        return result

    # --- 入口（dev） ---
    def create_dev_session(self, user_key: str) -> SessionResult:
        _assert_dev_mode(self._settings)
        identity = ProviderIdentity(
            provider="dev",
            subject=user_key,
            email=f"{user_key}@dev.local",
            display_name=user_key,
            photo_url=None,
        )
        user = self._resolve_user(identity)  # ← create_session と同一メソッド
        result = self._issue_session(user)  # ← create_session と同一メソッド
        self._db.commit()
        return result

    def refresh(self, refresh_token: str) -> SessionResult:
        """refresh token のローテーション + 再利用検知。

        DB と HMAC(sha256) のみを扱い、外部 I/O（JWKS 等）は一切行わない
        （`/auth/refresh` が 500 を返さない設計上の前提）。
        """
        now = self._now()
        token_hash = hash_refresh_token(refresh_token)
        row = self._refresh_repo.get_by_hash_for_update(token_hash)

        if row is None:
            raise InvalidRefreshTokenError("Unknown refresh token")

        if row.used_at is not None or row.revoked_at is not None:
            # 再利用検知: family_id 全体を即時失効させる（攻撃者・正規ユーザーの双方をログアウト）。
            self._refresh_repo.revoke_family(row.family_id, "reuse_detected", now)
            self._db.commit()
            logger.warning(
                "Refresh token reuse detected (user_id=%s, family_id=%s)",
                row.user_id,
                row.family_id,
            )
            raise RefreshTokenReuseDetectedError("Refresh token reuse detected")

        if row.expires_at <= now:
            self._refresh_repo.revoke(row, "expired", now)
            self._db.commit()
            raise InvalidRefreshTokenError("Refresh token expired")

        self._refresh_repo.mark_used(row, now)
        # `auth` から `users` へのアクセスは常に `UserService` 経由に統一する（A-3）。
        # `UserRepository` を直接持たないことで、「削除済み/BAN済みユーザーを弾く」判定を
        # 将来 `UserService.get_by_id()` に足すだけで、ここにも自動的に効くようにしておく。
        user = self._user_service.get_by_id(row.user_id)
        if user is None:
            # ユーザーが削除済み等。通常運用では起こり得ないが、念のため 401 に倒す。
            raise InvalidRefreshTokenError("User not found")

        result = self._issue_session(user, family_id=row.family_id)
        self._db.commit()
        return result

    def logout(self, refresh_token: str) -> None:
        """冪等: 未知/失効済みトークンでも例外を投げず正常終了する。"""
        token_hash = hash_refresh_token(refresh_token)
        row = self._refresh_repo.get_by_hash_for_update(token_hash)
        if row is not None:
            self._refresh_repo.revoke_family(row.family_id, "logout", self._now())
        self._db.commit()

    # --- 共通（real/dev で完全共有。ここを分岐させたらレビューで差し戻す） ---
    def _resolve_user(self, identity: ProviderIdentity) -> User:
        return self._user_service.find_or_create(
            provider=identity.provider,
            subject=identity.subject,
            email=identity.email,
            display_name=identity.display_name,
            photo_url=identity.photo_url,
        )

    def _issue_session(self, user: User, family_id: uuid.UUID | None = None) -> SessionResult:
        now = self._now()
        access_token, expires_in = create_access_token(user.id, self._settings, now=now)

        refresh_token = generate_refresh_token()
        token_hash = hash_refresh_token(refresh_token)
        resolved_family_id = family_id or uuid.uuid4()
        expires_at = now + timedelta(days=self._settings.auth_refresh_token_ttl_days)
        self._refresh_repo.create(
            user_id=user.id,
            token_hash=token_hash,
            family_id=resolved_family_id,
            expires_at=expires_at,
        )

        return SessionResult(
            access_token=access_token,
            expires_in=expires_in,
            refresh_token=refresh_token,
            user=user,
        )
