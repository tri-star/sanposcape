"""Apple の REST API 連携の失敗。メッセージに token・code・client secret を入れないこと。"""


class AppleSignInError(Exception):
    """Apple の REST API 連携の失敗の基底。"""


class AppleSignInNotConfiguredError(AppleSignInError):
    """鍵（Team ID・Key ID・.p8）が未設定、または読めないため Apple を呼べない。"""


class AppleSignInClientSecretError(AppleSignInError):
    """鍵はあるが client secret を生成できない（鍵の種類・アルゴリズムの不整合など）。

    設定ミスなので再試行しても直らない。運用者が直すもの（ログは ERROR）。
    """


class AppleSignInUnavailableError(AppleSignInError):
    """一時的な失敗（タイムアウト・接続失敗・5xx・429・408・425・想定外の応答）。

    `reason` は固定語彙（`timeout` / `connect_error` / `request_error` / `http_5xx` /
    `http_429` / `http_408` / `http_425` / `unexpected_status` / `invalid_response`）。
    ログに出してよい値だけを持たせ、Apple の応答や例外メッセージの任意の文字列は載せない。
    """

    def __init__(self, message: str, *, reason: str) -> None:
        super().__init__(message)
        self.reason = reason


class AppleSignInRejectedError(AppleSignInError):
    """Apple が要求を恒久的に拒否した（4xx）。同じ入力で再試行しても成功しない。

    `error_code` は Apple の `ErrorResponse.error` を既知の集合に正規化した値
    （それ以外は `"unknown"`）。Apple の応答の任意の文字列をログに反映させないため。
    """

    def __init__(self, error_code: str, status_code: int) -> None:
        super().__init__(f"Apple rejected the request: {error_code} (HTTP {status_code})")
        self.error_code = error_code
        self.status_code = status_code

    @property
    def is_expected_rejection(self) -> bool:
        """利用者・端末起因の想定内の拒否か（`invalid_grant`: code の期限切れ・使用済み・不正）。

        True なら WARNING、False なら ERROR にする。それ以外（`invalid_client` /
        `unauthorized_client` などの設定ミス、未知のコード、JSON でない 4xx）は運用者が
        確認すべきもので、ログの重みを ERROR にして埋もれさせない。
        """
        return self.error_code == "invalid_grant"
