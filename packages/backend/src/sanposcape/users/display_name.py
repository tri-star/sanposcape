"""表示名（`users.display_name`）の入力規則。

サインイン時に端末から受け取る氏名（`auth/schemas.py` の `SessionCreate.display_name`）と、
利用者が設定画面で変える表示名（`users/schemas.py` の `DisplayNameUpdate`。SS-268）の両方が使う。
表示名は users ドメインのものなのでここに置き、`auth` から import する
（依存の向きは `auth -> users`）。
"""

import unicodedata

#: `users.display_name` の列幅。超えると DB の DataError（500）になるため入口で弾く。
DISPLAY_NAME_COLUMN_LENGTH = 255

#: 利用者が設定画面で変える表示名の上限（code point 数。SS-268）。地図名・ピン名と同じ。
#: メンバー一覧・招待のプレビューでほかの利用者に見える名前なので、列幅より狭くする。
#: IdP から受け取る名前（Google の `name`・Apple の氏名）には適用しない（列幅まで受ける）。
DISPLAY_NAME_MAX_LENGTH = 50

# 表示名に入れさせない Unicode カテゴリ。Cc（NUL・改行等）、Zl/Zp（行・段落区切り）、
# Cf（書式制御。bidi 上書きやゼロ幅文字による表示なりすまし）。
_FORBIDDEN_CATEGORIES = frozenset({"Cc", "Cf", "Zl", "Zp"})
# Cf だが、絵文字の合字（ZWJ）や一部言語の正しい表記（ZWNJ）に必要なので許可する。
_ALLOWED_FORMAT_CHARS = frozenset({"\u200d", "\u200c"})

FORBIDDEN_CHARACTERS_MESSAGE = (
    "display_name must not contain control or invisible format characters"
)


def has_forbidden_characters(value: str) -> bool:
    """制御文字・行区切り・書式制御文字（ZWJ・ZWNJ を除く）を含むか。

    NUL は PostgreSQL の text に入らず 500 になる。改行・タブ等も名前としては不正。
    """
    return any(
        unicodedata.category(ch) in _FORBIDDEN_CATEGORIES and ch not in _ALLOWED_FORMAT_CHARS
        for ch in value
    )
