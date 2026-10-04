---
name: screen-header-duplication
description: 戻る IconButton＋タイトルの画面ヘッダーが10画面で重複している（Plane SS-40 で追跡中、未着手）。レビューでは新規指摘にせず SS-40 に言及し、優先度の引き上げを提案する
metadata:
  type: project
  scope: task-local
  source_issue: SS-40
---

「IconButton（`icon="chevron-left"`、label=戻る）＋タイトル＋スペーサー」のヘッダー行が、
ほぼ同じ実装で多数の画面に重複している。2026-10 時点で該当するのは次の10画面。
- walk: `WalkStartView`
- history: `WalkHistoryListView`、`WalkDetailView`
- pin: `PinDetailView`、`PinEditView`、`PinRegisterView`、`PinPhotoViewer`、
  `SanpoMapListView`、`SanpoMapDetailView`
- settings: `SettingsView`

複数の機能から同じ形が使われているので、`docs/folder-structure.md` の昇格基準に照らすと、
共通の `src/components/` コンポーネント（title、testIDPrefix、trailing スロット）にする候補になる。

**Plane の SS-40「mobile: 共通 ScreenHeader コンポーネントを切り出す」として起票済み**
（起票時は Backlog / low）。

**How to apply:** レビューで再度挙げるときは、新規指摘ではなく SS-40 への言及に留める。
起票時に「4画面目に増えたら優先度を上げる」としていた条件は既に満たしているので、
新しい画面がまた同じヘッダーを複製していたら、SS-40 の優先度を上げる提案を添える。
SS-40 が完了したら、このメモは削除する。
