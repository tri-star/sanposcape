---
name: back-navigation-convention
description: SS-34で導入された画面「戻る」導線の一本化（useScreenBack/resolveBackAction）の設計と既知のエッジケース
metadata:
  type: project
---

SS-34（`feat/ss-34-walk-start-back-navigation`）で、画面上の戻る/キャンセルと Android の
システムバックを `src/hooks/useScreenBack.ts` に一本化する規約が入った
（`docs/pages-components-guideline.md` の「画面の『戻る』導線の規約」節）。

- 判定ロジックは `src/lib/backNavigation.ts` の `resolveBackAction`（純粋関数、react-native非依存）。
  優先順位: intercepted > navigating > canGoBack ? pop : replace-fallback。8ケースのit.eachで
  truth table を網羅済み（`backNavigation.test.ts`）。
- `useScreenBack` はラッチを `useRef`（`navigatingRef`）で持ち、`useFocusEffect` の
  フォーカス時に `false` へリセットする。BackHandler の購読・解除も同じ `useFocusEffect` に
  乗せている（RN 0.65+ の `addEventListener` が返す `subscription.remove()` を使用）。
- `onIntercept` / `fallbackHref` は render中に ref へ書き込む方式（`interceptRef.current = onIntercept`）
  で、goBack自体（useCallbackの依存は`[router]`のみ）の identity を安定させている。
  → [[ref-assignment-during-render-pattern]] と同じ手法。
- 適用済み screen: `WalkStartView`（fallback `/(tabs)`、CategorySheet を `onIntercept` で閉じる、
  「散歩を始める」と `runOnce` でラッチ共有）、`WalkHistoryListView`（fallback `/(tabs)/history`）、
  `WalkDetailView`（fallback `/(tabs)/history`）。
- 未適用: `SettingsView`（`onPress={() => router.back()}` のまま、hardware back 未対応、
  canGoBack()==false 時のフォールバックも無い）。SS-34 のスコープ外だが、次にこの画面を
  触るときはこの規約への追従を検討する候補。

**既知の設計上のトレードオフ（バグではなく意図的な割り切り）**:
- `navigatingRef` は「フォーカスが一度外れて戻ってくる」ことでしかリセットされない。
  もし `router.replace(fallbackHref)` / `router.back()` が実際には画面遷移（blur）を
  引き起こさない異常系（例: ガードによるリダイレクトが失敗する等）が起きると、
  その画面の戻る/他の離脱操作が永久に無反応になるリカバリー手段が無い。
  `experiments.typedRoutes: true`（`app.json`）で `Href` の存在は型検査されるため
  「fallbackHref のタイプミス」由来のリスクは低いが、ゼロではない。
- `WalkDetailView`/`WalkHistoryListView` の「一覧へ戻る」「散歩を始める（空状態CTA）」等、
  `useScreenBack` 以外の離脱操作は `runOnce` の対象外（連打で `push` が二重に積まれうる）。
  「その画面から出る他の遷移は同じラッチを共有する」という規約文言はあるが、
  実際に `runOnce` を使っているのは `WalkStartView` の「散歩を始める」のみ。
