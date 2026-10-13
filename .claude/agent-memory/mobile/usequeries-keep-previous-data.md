---
name: usequeries-keep-previous-data
description: useQueries では queryKey が変わると keepPreviousData が効かない（オブザーバを作り直すので前回のデータが渡らない）。useQuery とは挙動が違う
metadata:
  type: feedback
  scope: task-local
  source_issue: SS-174
  verify_by: 2027-04-30
---

`@tanstack/query-core` 5.104 の `QueriesObserver` は、各クエリのオブザーバを `queryHash` で対応付ける（`#findMatchingObservers`）。
key が変わると一致するオブザーバが無いので新しく作る。新しいオブザーバは「最後にデータを持っていたクエリ」を知らないため、
`placeholderData: keepPreviousData` には `undefined` が渡り、placeholder が付かない（型も `QueriesPlaceholderDataFunction` で前回の値を受け取らない形）。
SS-174 で実測した: key を変えた直後の結果は `isPending: true`・`isPlaceholderData: false`・`data: undefined`。

**Why:** `useQuery` と同じ感覚で「key を変えても前のデータが出続ける」と書くと、JSDoc・ADR・E2E の待ち方が実際と食い違う
（SS-174 のレビューは、この誤解を前提に「読み込み中にならないので E2E の待ちが効かない」と指摘した。実際は読み込み中になる）。
`useRegisteredPins` の `keepPreviousData` と、`combineRegisteredPinListQueries` の `isPlaceholderData` の区別も、表示範囲の変更では効いていない。

**How to apply:** `useQueries` で key を変えたときの表示を決める・説明するときは、前のデータは残らない前提で考える。
本当に前のデータを残したいなら、key を変えずに済む構造にするか、前回の結果を自前で持つ。挙動に迷ったら、
`QueriesObserver` を node の vitest で直接動かして `getCurrentResult()` を見ると数分で確かめられる。

Related: [[hooks-and-query]]
