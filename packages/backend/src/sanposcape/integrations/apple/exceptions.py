"""Apple の REST API 連携の失敗。メッセージに token・code・client secret を入れないこと。"""


class AppleSignInError(Exception):
    """Apple の REST API 連携の失敗の基底。"""


class AppleSignInNotConfiguredError(AppleSignInError):
    """鍵（Team ID・Key ID・.p8）が未設定、または読めないため Apple を呼べない。"""


class AppleSignInUnavailableError(AppleSignInError):
    """一時的な失敗（タイムアウト・接続失敗・5xx・429・想定外の応答）。再試行すれば通りうる。"""


class AppleSignInRejectedError(AppleSignInError):
    """Apple が要求を恒久的に拒否した（4xx）。同じ入力で再試行しても成功しない。

    `error_code` は Apple の `ErrorResponse.error` を既知の集合に正規化した値
    （それ以外は `"unknown"`）。Apple の応答の任意の文字列をログに反映させないため。
    """

    def __init__(self, error_code: str, status_code: int) -> None:
        super().__init__(f"Apple rejected the request: {error_code} (HTTP {status_code})")
        self.error_code = error_code
        self.status_code = status_code
