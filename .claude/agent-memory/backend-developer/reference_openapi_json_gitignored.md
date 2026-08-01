---
name: reference-openapi-json-gitignored
description: packages/backend/openapi.json は.gitignore対象（openapi.yamlのみ追跡）。export後にgit statusで差分が出なくても異常ではない
metadata:
  type: reference
---

`packages/backend/.gitignore`（7行目）に `openapi.json` が指定されており、
`scripts/export_openapi.py` を実行して両ファイルを再生成しても `git status` 上は
`openapi.yaml` のみが変更として現れる（`openapi.json` は常に untracked のまま無視される）。

**Why:** SS-18 の Step 10（OpenAPI出力）で、export 後に `openapi.json` の diff が
一切出ずに一瞬「生成に失敗したのでは」と疑った。実際はリポジトリ内でコミット対象を
`openapi.yaml` 一本に絞る意図的な設計だった。

**How to apply:** OpenAPI 再出力タスクでは `git diff packages/backend/openapi.yaml` だけを
確認すればよい。`openapi.json` に差分が出ないことを異常だと早合点しない
（`git check-ignore -v packages/backend/openapi.json` で確認できる）。
