from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.auth.providers import build_identity_providers
from sanposcape.auth.providers.base import IdentityProvider
from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.auth.service import AuthService
from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


def get_identity_providers(
    settings: Settings = Depends(get_settings),
) -> dict[str, IdentityProvider]:
    """テストでは `dependency_overrides` で差し替え、テスト用 JWKS を注入する（§11.2）。"""
    return build_identity_providers(settings)


def get_auth_service(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    providers: dict[str, IdentityProvider] = Depends(get_identity_providers),
) -> AuthService:
    return AuthService(
        db,
        UserService(db, UserRepository(db)),
        RefreshTokenRepository(db),
        providers,
        settings,
    )
