---
name: per-domain-error-classification
description: API 操作ごとに別の xxxError.ts を持つのは意図的な設計（ADR-M-001 に記載）。DRY 違反として統合を提案しない。むしろ他操作の分類を再利用している方を疑う
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-001-folder-structure.md
---

`features/*/lib/` には、操作ごとに別のエラー分類ファイルがある（`walkHistoryError.ts`、`walkDeleteError.ts`、
`pinSaveError.ts`、`accountDeleteError.ts` など、2026-10 時点で13ファイル）。中身は同じ形に見えるが、
同じ HTTP ステータスでも操作によって意味が違うため（例: DELETE の 404 は「既に削除済み＝成功」）、
意図的に分けている。決定と理由は `packages/mobile/adr/ADR-M-001-folder-structure.md` の追補にある。

**How to apply:** 新しい `xxxError.ts` を見て「既存のものと統合すべき」と提案しない。逆に、
別の操作の分類ファイルを import して再利用している実装は、意味の違う 404/400 を混同するリスクがあるので
要注意として確認する。
