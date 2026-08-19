---
name: project_ss60_walk_delete
description: SS-60（散歩履歴削除UI）のレビュー背景と、そこで確立した「ドメインイベント後始末レジストリ」パターンの一般化状況
metadata:
  type: project
---

SS-60「mobile: 散歩履歴を削除するUIを実装」（2026-08-16 レビュー）で、`src/lib/sessionCleanup.ts`
（ADR-008 決定6。サインアウト時の後始末レジストリ）と同型の `src/lib/walkDeletionCleanup.ts`
（散歩削除時の後始末レジストリ、`(walkId: string) => void` を登録する形）が新設された。

**Why:** `features/history`（削除の実行元）から `features/walk/store/useFinishedWalkStore`
（`savedWalkId` 一致時にドラフトをクリアする必要がある）を直接 import すると
`folder-structure.md` の「その機能の外から import されるものは置かない」に反するため。
`useFinishedWalkStore` を `src/store/` へ昇格させる案は ADR-008 決定4 を覆すため ADR 追補が必要になり
過剰と判断し、既存の後始末レジストリパターンを転用した（実装者はこれを ADR 追補不要と判断）。

**How to apply:** この「クリアされる側が自分の後始末を登録し、実行側は1箇所からトリガーする」
パターンが2例目（sessionCleanup, walkDeletionCleanup）になった。
**SS-60 のレビュー対応で明文化済み**: `packages/mobile/docs/folder-structure.md` の `store/` 節を
「サインアウト専用」から「feature をまたぐイベント一般のパターン」に書き直し、2種類の
レジストリとその差分（引数の有無・条件付きクリア）を記載した。あわせて mobile ADR-008 に
決定8（削除の後始末レジストリ）を追加した。3例目のクリアトリガー（例: 将来のアカウント削除等）が
出てきたら、この節に追記する形で足りる（設計議論を一からやり直さない）。

関連ファイル: `packages/mobile/src/lib/walkDeletionCleanup.ts`,
`packages/mobile/src/lib/sessionCleanup.ts`,
`packages/mobile/src/features/walk/store/useFinishedWalkStore.ts`,
`packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md` 決定6。
