from fastapi import APIRouter, Depends, Response

from sanposcape.app_config.dependencies import get_feature_flags
from sanposcape.app_config.schemas import AppConfigRead, MinimumSupportedVersionsRead
from sanposcape.core.feature_flags import FeatureFlags

router = APIRouter(tags=["app-config"])


@router.get("/app-config", response_model=AppConfigRead, operation_id="get_app_config")
def get_app_config(
    response: Response, flags: FeatureFlags = Depends(get_feature_flags)
) -> AppConfigRead:
    """mobile / LP が読む公開エンドポイント。認証不要（`/health` と同じ扱い）。

    DB を触らない軽量経路にしている（DB 障害時にもフラグを配れるようにするため。
    ADR-008 が選択肢4 を却下した理由と同じ発想）。取得層（`integrations/aws/appconfig.py`）が
    ブロッキング I/O（boto3）を行うため、この関数は `async def` にしない
    （sync def なら FastAPI がスレッドプールで実行し、イベントループを止めない）。
    """
    # CloudFront のキャッシュポリシーに挙動を依存させない（ADR-008 追補 D10）。
    response.headers["Cache-Control"] = "no-store"
    versions = flags.minimum_supported_versions()
    return AppConfigRead(
        flags=flags.client_flags(),
        minimum_supported_versions=MinimumSupportedVersionsRead(
            ios=versions.ios, android=versions.android
        ),
        config_source=flags.source_kind(),
    )
