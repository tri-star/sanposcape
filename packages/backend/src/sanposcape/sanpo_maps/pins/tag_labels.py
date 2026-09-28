"""タグの正規化・重複排除（純粋関数、DB/HTTP に依存しない）。

mobile 側の正規化とケース表を揃える（backend-plan.md 5.3 (4) / 10章「タグの正規化は
mobile と backend の二重実装」）。サーバーでも同じ正規化を行うのは、改造クライアントが
未正規化のタグを送ってきても `UNIQUE(pin_id, label_key)` の意図（大文字小文字違いの
重複を防ぐ）を守るため。
"""

import re

#: 正規化後のタグ1件あたりの長さ上限（mobile の正規化契約と揃える, PR #93 T5）。
#: `pins/schemas.py` の `PinTagLabel`（生入力の型）はこれより緩い安全上限だけを持ち、
#: 実際の20文字制限はここ（正規化後）で検証する。
PIN_TAG_MAX_LENGTH = 20

_LEADING_HASH_PATTERN = re.compile(r"^[#＃]+")
_WHITESPACE_PATTERN = re.compile(r"\s+")


def normalize_tag_label(raw: str) -> str:
    """trim・連続空白を1つに圧縮・先頭の `#`/`＃` を除去する。"""
    value = raw.strip()
    value = _LEADING_HASH_PATTERN.sub("", value)
    value = value.strip()
    return _WHITESPACE_PATTERN.sub(" ", value)


def tag_key(label: str) -> str:
    """重複判定キー（正規化 + 小文字化）。`pin_tags.label_key` に保存する値と同じ。"""
    return normalize_tag_label(label).lower()


def dedupe_tags(labels: list[str], *, max_length: int = PIN_TAG_MAX_LENGTH) -> list[str]:
    """各タグを正規化し、`tag_key` が一致するものを先勝ちで黙って除去して返す。

    長さの検証は正規化の**後**に行う（PR #93 T5: 以前は `pins/schemas.py` の
    `PinTagLabel`（生入力の型）に `max_length=20` を適用していたため、mobile なら
    正規化後に20文字以内になるタグ（先頭の `#`/`＃` や前後の空白を含む入力）まで
    422 になっていた）。正規化後に空文字列になったタグ（記号・空白のみの入力）、
    または `max_length` を超えるタグは `ValueError` にする
    （`pins/schemas.py` の validator から呼ばれ、そのまま 422 になる）。
    """
    seen: set[str] = set()
    result: list[str] = []
    for raw in labels:
        normalized = normalize_tag_label(raw)
        if not normalized:
            raise ValueError(f"Tag label is empty after normalization: {raw!r}")
        if len(normalized) > max_length:
            raise ValueError(
                f"Tag label exceeds {max_length} characters after normalization: {raw!r}"
            )
        key = tag_key(normalized)
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result
