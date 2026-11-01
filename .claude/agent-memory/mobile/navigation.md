---
name: navigation
description: mobile のスタックと戻る導線の実態 — replace の連鎖で canGoBack=false、index.tsx と (tabs)/index.tsx、BackHandler は useFocusEffect で購読、Redirect はフォーカス時のみ、useSegments は1コミット遅れる、flash の消費先、戻る処理でストアを触らない
metadata:
  type: feedback
  scope: durable
---

「戻る」導線の規約（`useScreenBack` に一本化・`resolveBackAction` の優先順位・`runOnce` のラッチ・適用画面・testID・タブでは `useNavigateOnce`）は
`pages-components-guideline.md`「画面の『戻る』導線の規約」、タブを隠す方法（`href: null` は `AppTabBar` に効かない）は `architecture-guideline.md`「画面ガードレシピ」、
タブからは push は ADR-M-011 D6 が正本。ここにはコードを読まないと分からない事実を置く。

## スタックの実態

- **主要導線は `replace` の連鎖**: `/`（スプラッシュ）→ `replace` `/(auth)/sign-in` → `replace` ピンタブ `/(tabs)/pins`（着地点は ADR-M-009 の SS-145 追補）。
  着地した時点で `router.canGoBack() === false`。`/walk-start` ⇄ `(tabs)` も互いに `replace` なので、往復してもスタックは伸びない。
- **`app/index.tsx`（スプラッシュ）と `app/(tabs)/index.tsx`（ナビタブ）は共存できる**（Expo Router の認証ガイドにある正式な形。型には別の href として載る）。
  タブへは `"/(tabs)"` で遷移し、裸の `"/"` は使わない。
- `Tabs`（`expo-router`）は `@deprecated` だが動く。`BottomTabBarProps` はトップレベルから re-export されていないので、
  内部パスを import せず、使うフィールドだけの最小のローカル型で受ける（`AppTabBar.tsx`）。
- Expo Router には「前の画面へ結果を返す」正式な手段が無い。登録画面の状態を保ったまま子の結果が欲しいときは、ルートを増やさず画面内のオーバーレイにするのが一番安い。

## BackHandler とフォーカス

- 購読は **`useFocusEffect`（expo-router が re-export）の中で**行う。`useEffect` だと上に別画面が積まれている間もリスナが生き、上の画面のバックを奪う。
- RN 0.86 に `BackHandler.removeEventListener` は無い。`addEventListener` の戻り値の `.remove()` を使う。
- ラッチは `useRef<boolean>`（state だと再レンダーを挟み連打に間に合わない）。フォーカス時に解除する。
  `onIntercept` などの最新値はレンダー中に ref へ代入して読む（呼び出し側で `useCallback` 不要）。
- **expo-router の `<Redirect>` は `useFocusEffect` の中で `replace` する**ので、フォーカス中の画面でしか動かない。タブ内の画面ガードが、別のタブにいるユーザーを引き戻すことはない。
- `Tabs` の `backBehavior` の既定は `firstRoute`（ナビタブへ戻ってから終了）。

## `useSegments()` はナビゲーションの状態より1コミット遅れる

expo-router 57 の `useSegments` は `store.onStateChange` で更新され、それは `BaseNavigationContainer` の `useEffect` から呼ばれる。
同じイベントの中でストアを変えて `router.push` すると（例: 散歩の終了で `endWalk()` → `push("/walk-summary")`）、
**新しいストアの値と古いセグメントの組で1回コミットされる**。

**Why:** SS-101 のアップデートの案内は「未保存の散歩があり、サマリ画面にいる間は出さない」としていたため、散歩の終了直後に
セグメントが散歩中の画面のままになり、案内の `Modal` が `visible=true` で一瞬コミットされた（レビューで判明。screencap では捉えられない）。

**How to apply:** 「今どの画面にいるか」と「ストアの状態」の組で表示を決めるときは、遷移の途中のコミットでどうなるかを確かめる。
画面に着いたことを state で覚える（`useUpdateRequired` の `summaryVisitedWalkId`）などで、セグメントの遅れに頼らない形にする。

## flash トーストは消費する画面でしか出ない

`setFlashMessage` を消費するのは `WalkActiveView`・`PinTabView`・`PinDetailView`・`SanpoMapDetailView`・`SanpoMapListView`（SS-249。メンバー画面で地図から抜けた後の戻り先）の `useFocusEffect`（2026-10 時点。`rg consumeFlashMessage` で確かめる）。

**How to apply:** flash を使う遷移では、戻り先になりうる画面すべてで消費しているか確かめる。足さないと、次にピンタブへフォーカスしたとき遅れて出る。

## 戻る処理でストアを触らない

散歩開始前の画面の状態（`useWalkPlan` の時間・カテゴリ・スポット）はすべて `useState` で、アンマウントで消える。明示的なクリア関数を足さない。

**Why:** 戻る処理で `useActiveWalkStore.endWalk()` を呼ぶと、散歩中 → 記録 → 履歴の空状態の CTA → `/walk-start` の経路で、進行中の散歩を巻き添えにする。

**How to apply:** 戻る処理では進行中のデータを破棄しない。Query キャッシュ（`useSpotCandidates` gcTime 30分 / `useWalkRoute` gcTime 2時間）も意図的に残す（再探索は外部呼び出しが最大21回）。

Related: [[auth-and-session]], [[testing-and-e2e]]
