---
name: reference-openapi-export-diff-expectations
description: OpenAPI 再出力で差分が出る・出ないときの判断材料。openapi.json は gitignore（yaml だけ追跡）、docstring 変更で yaml に差分が出る、AwareDatetime 化やコード移動では差分ゼロが正常、契約テストはレスポンスコードの「存在」しか見ていない
metadata:
  type: reference
  scope: durable
---

`scripts/export_openapi.py` で再出力したときに「差分が出ない／出た」を異常と早合点しないための事実集
（SS-18・SS-53・SS-111 で確認）。

**Why:** 差分ゼロを見て生成失敗を疑ったり、逆に「API を変えていないのに差分が出た」と戸惑ったりして時間を使った。

**How to apply:**

- **`packages/backend/openapi.json` は gitignore 対象**（`packages/backend/.gitignore`）。追跡するのは Orval が読む
  `openapi.yaml` だけなので、`git diff packages/backend/openapi.yaml` だけを見ればよい
  （`git check-ignore -v packages/backend/openapi.json` で確認できる）。
- **`openapi.yaml` は手で編集しない。** router・schema の docstring や説明文が生成元なので、コメントや docstring を
  直しただけでも差分が出る。変更後は
  `docker compose -f packages/backend/compose.yaml exec api uv run python scripts/export_openapi.py` で作り直してから
  commit する。
- **差分ゼロが正常なケース**: `datetime` → `pydantic.AwareDatetime` への変更（どちらも
  `type: string, format: date-time`）、ロジック不変のコード移動（middleware を `core/` へ移すなど）。
- **OpenAPI 契約テストは特定レスポンスコードの「存在」（`"401" in operation["responses"]`）しか見ていない**
  （`walks/tests/test_router.py` など）。レスポンスコードを OpenAPI に足す修正は既存テストを壊しにくい反面、
  「このコードは含まれない」ことを保証したいなら明示的なテストを別に足す必要がある。

関連: [[feedback-sandbox-constraints]]
