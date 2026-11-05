from fastapi import Depends, Request
from sqlalchemy.orm import Session

from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.integrations.apple.client import AppleSignInClient
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.photos.account_purge import AccountPhotoPurgeScheduler
from sanposcape.sanpo_maps.pins.account_deletion import build_sanpo_map_account_deletion
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository
from sanposcape.users.service import AccountDeletionService, UserService


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    """request-scoped session を使う UserService を供給する。"""
    return UserService(db, UserRepository(db))


def get_apple_sign_in_client(request: Request) -> AppleSignInClient:
    """App-lifespan singleton（`get_object_storage` と同じ形）。

    テストはこの依存を `dependency_overrides` で Fake に差し替え、Apple に出ないようにする。
    `auth` と `users` の両方が使うため、ここ（`auth -> users` の向きで import できる側）に置く。
    """
    return request.app.state.apple_sign_in_client


def get_account_deletion_service(
    request: Request,
    db: Session = Depends(get_db),
    apple_sign_in_client: AppleSignInClient = Depends(get_apple_sign_in_client),
    settings: Settings = Depends(get_settings),
) -> AccountDeletionService:
    # `sanpo_maps.photos.dependencies.get_object_storage` は公開面（ADR-011 M7）の外なので、
    # 同じ app-lifespan singleton を直接読む。
    storage: ObjectStorage = request.app.state.object_storage
    return AccountDeletionService(
        db,
        UserService(db, UserRepository(db)),
        AppleAuthorizationRepository(db),
        apple_sign_in_client,
        AccountPhotoPurgeScheduler(db, retention_days=settings.account_photo_retention_days),
        build_sanpo_map_account_deletion(db, storage, settings),
    )
