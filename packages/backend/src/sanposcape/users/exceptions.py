class AccountDeletionUnavailableError(Exception):
    """Apple のトークン失効が一時的に失敗したため、アカウントを削除しなかった（503 に変換）。

    トークンは残っているので、ユーザーの再試行で失効まで完了できる（Apple の失効は冪等）。
    """
