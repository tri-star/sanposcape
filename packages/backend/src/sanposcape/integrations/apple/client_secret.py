"""Apple の REST API に渡す client secret（ES256 の JWT）の生成。

仕様: https://developer.apple.com/documentation/accountorganizationaldatasharing/creating-a-client-secret
- ヘッダー: `alg=ES256` / `kid=Key ID`
- クレーム: `iss=Team ID` / `iat` / `exp`（`iat` から最長 15777000 秒）/
  `aud=https://appleid.apple.com` / `sub=client_id`（App ID = bundle ID）
"""

from datetime import datetime

import jwt
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.serialization import load_pem_private_key

APPLE_AUDIENCE = "https://appleid.apple.com"
# 呼び出しごとに生成して使い捨てるので短くする（長命の secret が漏れたときの影響を減らす）。
CLIENT_SECRET_TTL_SECONDS = 300


def load_private_key(pem: str) -> ec.EllipticCurvePrivateKey:
    """.p8（PKCS#8 の PEM）を読み、EC P-256 の秘密鍵を返す。

    読めない・P-256 の EC 鍵でないときは `ValueError`（メッセージに PEM を含めない）。
    """
    try:
        key = load_pem_private_key(pem.encode("utf-8"), password=None)
    except (ValueError, TypeError) as exc:
        raise ValueError("Apple sign-in private key could not be loaded") from exc
    if not isinstance(key, ec.EllipticCurvePrivateKey) or not isinstance(key.curve, ec.SECP256R1):
        raise ValueError("Apple sign-in private key must be an EC P-256 key")
    return key


def build_client_secret(
    *,
    team_id: str,
    key_id: str,
    private_key: ec.EllipticCurvePrivateKey,
    client_id: str,
    now: datetime,
    ttl_seconds: int = CLIENT_SECRET_TTL_SECONDS,
) -> str:
    """client secret を生成する（純粋関数。現在時刻は `now` で注入する）。"""
    issued_at = int(now.timestamp())
    claims = {
        "iss": team_id,
        "iat": issued_at,
        "exp": issued_at + ttl_seconds,
        "aud": APPLE_AUDIENCE,
        "sub": client_id,
    }
    return jwt.encode(claims, private_key, algorithm="ES256", headers={"kid": key_id})
