"""サインイン時の Apple authorization code の交換（SS-198）。

DB を持たない関数にして、条件判定・例外の握り・ログの重み・本人確認を 1 箇所に閉じ込める。
交換はベストエフォート: 失敗してもサインインは失敗させない（token を保存しないだけ。
Apple の一時障害で Apple ユーザーがサインインできなくなる方が影響が大きい。
次回のサインインで端末が新しい code を送れば自己回復する）。

code は 1 回限りなので再試行しない。code・refresh token・id_token はログに出さない（ADR-013）。
"""

import logging

from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.integrations.apple.client import AppleSignInClient, AppleTokenGrant
from sanposcape.integrations.apple.exceptions import (
    AppleSignInError,
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
)

logger = logging.getLogger(__name__)

# 鍵・Team ID・Key ID・App ID の設定ミスを示す。運用者が直すものなので ERROR にする。
_CONFIGURATION_ERROR_CODES = frozenset({"invalid_client", "unauthorized_client"})


def exchange_apple_authorization_code(
    client: AppleSignInClient | None,
    identity: ProviderIdentity,
    code: str | None,
) -> AppleTokenGrant | None:
    """code を refresh token に交換し、保存してよい場合だけ `AppleTokenGrant` を返す。

    次のいずれかなら Apple を呼ばず `None`: Apple 以外 / code が無い / 検証済みの aud が無い /
    クライアントが無い。Apple の呼び出しが失敗した場合、または交換結果が検証済みのユーザーと
    一致しない場合も `None`（例外は出さない）。
    """
    if client is None or identity.provider != "apple" or not code or identity.audience is None:
        return None

    try:
        grant = client.exchange_authorization_code(code, client_id=identity.audience)
    except AppleSignInNotConfiguredError:
        # 未設定は起動時（lifespan）に 1 回ログに出している。サインインのたびには出さない。
        return None
    except AppleSignInRejectedError as exc:
        level = logging.ERROR if exc.error_code in _CONFIGURATION_ERROR_CODES else logging.WARNING
        logger.log(
            level,
            "Apple authorization code exchange was rejected: %s (HTTP %s)",
            exc.error_code,
            exc.status_code,
        )
        return None
    except AppleSignInError as exc:
        logger.warning("Apple authorization code exchange failed: %s", type(exc).__name__)
        return None

    # 他人の code を自分のアカウントに紐付けられると、自分のアカウント削除で他人の認可を
    # 取り消せてしまう。検証済みの ID token の sub・aud と一致するときだけ保存する。
    if grant.subject != identity.subject or grant.audience != identity.audience:
        logger.warning("Apple authorization code exchange result does not match the signed-in user")
        return None
    return grant
