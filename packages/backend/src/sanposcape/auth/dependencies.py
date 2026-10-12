from fastapi import Depends
from sqlalchemy.orm import Session

from sanposcape.auth.providers import build_identity_providers, warn_apple_disabled_once
from sanposcape.auth.providers.base import IdentityProvider
from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.auth.service import AuthService
from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.integrations.apple.client import AppleSignInClient
from sanposcape.users.dependencies import get_apple_sign_in_client
from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


def get_identity_providers(
    settings: Settings = Depends(get_settings),
) -> dict[str, IdentityProvider]:
    """テストでは `dependency_overrides` で差し替え、テスト用 JWKS を注入する（§11.2）。"""
    providers = build_identity_providers(settings)
    if "apple" not in providers:
        warn_apple_disabled_once()
    return providers


def get_auth_service(
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
    providers: dict[str, IdentityProvider] = Depends(get_identity_providers),
    apple_sign_in_client: AppleSignInClient = Depends(get_apple_sign_in_client),
) -> AuthService:
    return AuthService(
        db,
        UserService(db, UserRepository(db)),
        RefreshTokenRepository(db),
        providers,
        settings,
        apple_sign_in_client=apple_sign_in_client,
    )
