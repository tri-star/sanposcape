---
name: history-view-duplicated-branch-conditions
description: WalkHistoryListView/WalkDetailView（features/history）は「中央寄せラッパーにするか」の判定条件と renderBody() 内部の状態分岐条件を2箇所に別々に書いており、片方だけ更新すると表示崩れを起こしうる
metadata:
  type: project
---

SS-20 の `packages/mobile/src/features/history/components/WalkHistoryListView.tsx` と
`WalkDetailView.tsx` は、どちらも次の形をしている。

```tsx
const renderBody = () => {
  if (errorCode !== null) { ... }
  if (isLoading) { ... }
  if (items.length === 0) { ... }
  return <FlatList .../>;
};

// renderBody() 内の条件と全く同じ判定を、ラッパーの選択でもう一度書いている
{errorCode !== null || isLoading || items.length === 0 ? (
  <View style={styles.centerContent}>{renderBody()}</View>
) : (
  renderBody()
)}
```

**Why:** 「エラー/ローディング/空のときは中央寄せの `View` で包み、一覧のときは包まない」という
判断基準が、`renderBody()` の内部分岐と外側のラッパー選択の2箇所に重複している。将来 状態が
1つ増える（例: `isRefetching` 専用の表示）などで分岐を変えるとき、片方だけ更新すると
「FlatList が中央寄せの狭い `View` に閉じ込められる」「空状態カードが画面いっぱいに間延びする」
といった見た目の不整合が起きうる。lint/tsc では検出できない構造上の重複。

**How to apply:** `features/history` 系の一覧・詳細ビュー（および同じ形をコピーして作られる
将来の画面）をレビューするときは、`renderBody()`（または同等の関数）が返す JSX の外側で
再度同じ状態条件を書いていないか確認する。見つけたら、`renderBody()` 自身が
`{ content: ReactNode; centered: boolean }` を返す、あるいは各状態分岐で自身の外側 View を
含めて返す、といった一本化を提案する（Warning 相当）。
