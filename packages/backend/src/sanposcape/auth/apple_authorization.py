"""サインイン時の Apple authorization code の交換（SS-198）。

DB を持たない関数にして、条件判定・例外の握り・ログの重み・本人確認を 1 箇所に閉じ込める。
交換はベストエフォート: 失敗してもサインインは失敗させない（token を保存しないだけ。
Apple の一時障害で Apple ユーザーがサインインできなくなる方が影響が大きい。
次回のサインインで端末が新しい code を送れば自己回復する）。

code は 1 回限りなので再試行しない。code・refresh token・id_token はログに出さない（ADR-013）。
"""

import logging
from dataclasses import dataclass

from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.integrations.apple.client import AppleSignInClient
from sanposcape.integrations.apple.exceptions import (
    AppleSignInClientSecretError,
    AppleSignInError,
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class VerifiedAppleGrant:
    """検証済みのユーザーに紐づくと確認できた交換結果。保存してよい値だけを持つ。"""

    client_id: str
    refresh_token: str

    def __repr__(self) -> str:
        # refresh token を repr（ログ・pytest の差分表示）に出さない。
        return f"VerifiedAppleGrant(client_id={self.client_id!r})"


def exchange_apple_authorization_code(
    client: AppleSignInClient | None,
    identity: ProviderIdentity,
    code: str | None,
) -> VerifiedAppleGrant | None:
    """code を refresh token に交換し、保存してよい場合だけ `VerifiedAppleGrant` を返す。

    次のいずれかなら Apple を呼ばず `None`: Apple 以外 / code が無い / 検証済みの aud が無い /
    クライアントが無い。Apple の呼び出しが失敗した場合、または交換結果が検証済みのユーザーと
    一致しない場合も `None`（例外は出さない。想定外の例外も安全網で握る）。
    """
    client_id = identity.audience
    if client is None or identity.provider != "apple" or not code or client_id is None:
        return None

    try:
        grant = client.exchange_authorization_code(code, client_id=client_id)
    except AppleSignInNotConfiguredError:
        # 未設定は起動時（lifespan）に 1 回ログに出している。サインインのたびには出さない。
        return None
    except AppleSignInClientSecretError as exc:
        # 鍵はあるが署名できない。起動時のログには出ない設定ミスなので、毎回 ERROR で知らせる。
        logger.error("Apple authorization code exchange failed: %s", exc)
        return None
    except AppleSignInRejectedError as exc:
        # invalid_grant（code の期限切れ・使用済み）だけが想定内。それ以外は設定ミスや
        # 想定外の拒否なので ERROR にして埋もれさせない。
        logger.log(
            logging.WARNING if exc.is_expected_rejection else logging.ERROR,
            "Apple authorization code exchange was rejected: %s (HTTP %s)",
            exc.error_code,
            exc.status_code,
        )
        return None
    except AppleSignInUnavailableError as exc:
        logger.warning("Apple authorization code exchange failed: %s", exc.reason)
        return None
    except AppleSignInError as exc:
        logger.warning("Apple authorization code exchange failed: %s", type(exc).__name__)
        return None
    except Exception as exc:
        # 交換はベストエフォート。クライアントの想定外の例外（バグ）でサインインを落とさない。
        # 例外のメッセージには code・token が含まれうるので、型名だけを出す。
        logger.error(
            "Apple authorization code exchange failed unexpectedly: %s", type(exc).__name__
        )
        return None

    # 他人の code を自分のアカウントに紐付けられると、自分のアカウント削除で他人の認可を
    # 取り消せてしまう。検証済みの ID token の sub・aud と一致するときだけ保存する。
    # 不一致のときの token は破棄するだけで失効させない（ADR-002 の SS-198 追補）。
    if grant.subject != identity.subject or grant.audience != client_id:
        logger.warning("Apple authorization code exchange result does not match the signed-in user")
        return None
    return VerifiedAppleGrant(client_id=client_id, refresh_token=grant.refresh_token)
