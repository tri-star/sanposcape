---
name: screen-header-duplication
description: 戻るIconButton+タイトルの画面ヘッダーがWalkStartView/WalkHistoryListView/WalkDetailViewで重複している（Plane SS-40 で追跡中）
metadata:
  type: project
---

`WalkStartView`（features/walk）、`WalkHistoryListView` / `WalkDetailView`（features/history）は
いずれも「IconButton(icon=chevron-left, label=戻る, variant=ghost, testID=`${screen}-back`) +
タイトル + （スペーサー or もう1つのIconButton）」というヘッダー行をほぼ同じ実装で持つ。
`WalkHistoryListView` と `WalkDetailView` はスタイル定義まで実質同一（`header`/`title`/
`headerSpacer` の StyleSheet も重複）。`SettingsView` も同型のヘッダーを持つ。

2機能（walk, history）から同じ形が使われている状態のため、`folder-structure.md` の
「2つ以上の機能から使うか？→ Yes なら components/ へ」という昇格基準に照らすと、
共通の `ScreenBackHeader`（title, testIDPrefix, 任意のtrailingスロット）のような
コンポーネントへ昇格する候補になり得る。

**この件は Plane の SS-40「mobile: 共通 ScreenHeader コンポーネントを切り出す」として
既に起票済み（Backlog / low）**。レビューで再度 Suggestion として挙げる場合は
「未起票の新規指摘」ではなく SS-40 への言及に留め、指摘の重複を避けること。
次にこのパターンが4画面目に増える、または手編集で3箇所がズレ始めたら、SS-40 の
優先度を上げる提案をしてよい。
