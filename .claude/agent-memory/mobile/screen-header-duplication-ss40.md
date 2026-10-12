---
name: screen-header-duplication-ss40
description: 画面ヘッダー（戻る IconButton + タイトル + スペーサー）の重複は SS-40 で追跡中。新規指摘にせず SS-40 に言及する
metadata:
  type: project
  scope: task-local
  source_issue: SS-40
---

「戻る IconButton（`chevron-left`）+ タイトル + スペーサー」のヘッダーが10画面で重複している（2026-10 時点。共通の `ScreenHeader` は未作成）。
Plane の SS-40「mobile: 共通 ScreenHeader コンポーネントを切り出す」で追跡中。

**Why:** 既知の重複をレビューのたびに新しい指摘として挙げると、指摘が重複して本来の指摘が埋もれる。

**How to apply:** 新規指摘にせず SS-40 に言及する。新しい画面がまた同じヘッダーを複製していたら、SS-40 の優先度を上げる提案を添える。
SS-40 が閉じたら、このメモリは削除する（task-local のため knowledge-harvest の対象になる）。
