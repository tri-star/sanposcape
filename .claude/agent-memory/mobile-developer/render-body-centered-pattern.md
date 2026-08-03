---
name: render-body-centered-pattern
description: List/detail画面で「エラー/ローディング/空は中央寄せ、本体一覧はそのまま」を実装するときの重複防止パターン
metadata:
  type: project
---

`features/history/components/WalkHistoryListView.tsx` / `WalkDetailView.tsx` は、状態（エラー/
ローディング/空/本体）ごとに中央寄せラッパーで包むかどうかが変わる画面。当初の実装は
`renderBody()` の内部分岐と、呼び出し側の中央寄せ判定に**同じ条件を2箇所書いていた**
（SS-20レビューで指摘・修正済み）。

**How to apply:** 同じ形の画面を新しく書くときは、`renderBody()` が
`{ content: ReactNode; centered: boolean }` を返す形にし、判定条件を1箇所に閉じる。

```tsx
type Body = { content: ReactNode; centered: boolean };

const renderBody = (): Body => {
  if (errorCode !== null) return { centered: true, content: <ErrorCard /> };
  if (isLoading) return { centered: true, content: <Loading /> };
  if (items.length === 0) return { centered: true, content: <EmptyCard /> };
  return { centered: false, content: <FlatList ... /> };
};

const body = renderBody();
// ...
{body.centered ? <View style={styles.centerContent}>{body.content}</View> : body.content}
```

`[[test-scope-hooks-components]]` の制約上コンポーネントは Vitest でテストできないため、
この手の構造上の重複はレビューでしか検知できない。新しい状態分岐を増やすときは
`renderBody()` の中だけを見ればよい形を保つこと。
