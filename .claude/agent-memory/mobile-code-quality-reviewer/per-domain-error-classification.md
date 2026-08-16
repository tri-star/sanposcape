---
name: per-domain-error-classification
description: API操作ごと(GET/POST/DELETE)に別のxxxError.tsを持つ方針。DRY違反として統合を提案しない
metadata:
  type: project
---

mobile の `features/*/lib/` には操作ごとに別々のエラー分類ファイルがある
（`walkHistoryError.ts`＝GET一覧・詳細、`walkSaveError.ts`＝POST保存、`walkDeleteError.ts`＝DELETE、
`walkStatsError.ts`＝集計GET）。中身は「`isApiError()`でstatusを見てcode/文言/再試行可否を返す」という
同じ形をしているため一見 DRY 違反に見えるが、**意図的に体系を分けている**。

理由: 同じ HTTP ステータスでも操作によって意味が違う。例えば 404 は GET 詳細では
「見つからない＝エラー」だが、DELETE では `walkDeleteApi.ts` の `deleteWalk()` が
「既に削除済み＝成功」に読み替えるため `walkDeleteError.ts` の分類コードには現れない。
400（invalid_cursor）は一覧 GET 特有で DELETE には存在しない。共通化すると
「このコードは今の操作で本当に有効か」を毎回確認する必要が生まれ、かえって事故りやすくなる。

**Why**: 各ファイルの JSDoc 冒頭に明記された設計判断（例: `walkDeleteError.ts` 冒頭コメント参照）。

**How to apply**: 新しい `xxxError.ts` が追加されているのを見て「既存の `walkHistoryError.ts` と
統合すべき」と提案しない。むしろ既存ファイルを import・再利用している方が要注意
（意味体系の異なる404/400を誤って混同するリスクがある）。
