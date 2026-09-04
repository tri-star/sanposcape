"""アクセストークンを HTTP ヘッダーから取り出す共通ロジック。

CloudFront + OAC（`SigningBehavior=always`）はオリジン（Lambda Function URL）へ転送する
`Authorization` ヘッダーを CloudFront 自身の SigV4 署名で上書きする。そのため mobile は
アクセストークンを独自ヘッダー `X-App-Authorization` で運び、backend はそちらを優先して
読む。ローカル開発 / CI は CloudFront を経由しないため、`Authorization` のままでも
引き続き動く（フォールバック）。
詳細: tmp/SS-67/backend-plan.md 決定9 / docs/deployment.md。
"""

from fastapi import Request

from sanposcape.auth.exceptions import MalformedAuthorizationHeaderError

# 優先順位: X-App-Authorization を先に見る。CloudFront が転送する Authorization は
# CloudFront 自身の署名で上書きされているため、mobile からの実トークンは含まれない。
_HEADER_PRIORITY = ("X-App-Authorization", "Authorization")


def extract_bearer_token(request: Request) -> str | None:
    """`X-App-Authorization` → `Authorization` の順で `Bearer <token>` を読む。

    いずれのヘッダーも存在しなければ `None` を返す（匿名アクセスを許すエンドポイント
    向け）。ヘッダーは存在するが `Bearer <token>` 形式でない場合は
    `MalformedAuthorizationHeaderError` を送出する（不正なヘッダーを匿名アクセスへ
    フォールバックさせないため。呼び出し側で 401 に変換する）。
    優先度の高いヘッダーが存在する場合、それが不正な形式でも低い方へは
    フォールバックしない（想定外のヘッダー混在を静かに許容しないため）。
    """
    for header_name in _HEADER_PRIORITY:
        value = request.headers.get(header_name)
        if value is None:
            continue
        scheme, separator, token = value.partition(" ")
        if scheme.lower() != "bearer" or not separator or not token:
            raise MalformedAuthorizationHeaderError(header_name)
        return token
    return None
