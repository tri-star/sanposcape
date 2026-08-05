---
name: project-navigation-model
description: mobile のルートスタックの実態（どこで canGoBack が false になるか）と Android バック対応の前提
metadata:
  type: project
---

ナビゲーション/導線まわりのプランで毎回効く、コードを読まないと分からない事実（2026-08 / SS-34 の調査で確認）。

## スタックの実態

- **主要導線は `replace` の連鎖**: `/`(スプラッシュ) → `replace` `/(auth)/sign-in` → `replace` `/walk-start`。
  → **`/walk-start` に着いた時点で `router.canGoBack() === false`**。Android のシステムバックは
  既定でアプリ終了になる。`/walk-start` ⇄ `/(tabs)` も互いに `replace`（`WalkIdleNotice` の CTA が
  `replace("/walk-start")`）なので、往復してもスタックは1枚のまま伸びない。
- **アプリの既定ホームは `(tabs)`**（ナビ/検索/記録）。`WalkSummaryView` の「ホームへ」も
  `replace("/(tabs)")`。「スポット一覧・検索・過去記録に届く画面」＝ `(tabs)` しかない。
- `/walk-start` に `push` で入る経路は3つだけ: `/walk-history` の空状態 CTA、`/dev-screens`、
  そして `WalkActiveView` の idle CTA（これは `replace`）。
- 既存の戻る実装は `canGoBack() ? back() : replace(fallback)`。`WalkHistoryListView` と
  `WalkDetailView` に**同じコードが2箇所コピー**されている（連打ガード・システムバック対応は無い）。
  `SettingsView` は素の `router.back()`。

## Android バックの前提

- `app.json` に **`expo.android.predictiveBackGestureEnabled: false`**。
  → `BackHandler.addEventListener("hardwareBackPress", ...)` で `true` を返す従来方式が有効。
  predictive back を有効化すると方式ごと破綻するので、有効化提案時は必ず連動して見直す。
- RN 0.86 に **`BackHandler.removeEventListener` は無い**。`addEventListener` の戻り値の `.remove()`。
- 購読は **`useFocusEffect`（`expo-router` が re-export 済み）の中で**行う。`useEffect` だと上に別画面が
  積まれている間もリスナが生きて上の画面のバックを奪う。
- BottomSheet/Dialog は RN の `Modal`（`onRequestClose`）なので、Android バックは Modal 側が拾う想定。

## 散歩開始「前」に副作用が無いことの根拠

`clientWalkId` 採番・`useActiveWalkStore.startWalk()` は `WalkStartView.handleStartWalk` の中だけ。
`watchPosition` は `useWalkTracking`（`enabled: activeWalk !== null`）のみ。`/walk-start` は
`getCurrentPosition()` の単発だけ。`useWalkPlan` の状態は全部 `useState`（アンマウントで消える）。
→ 「戻ったら開始状態が残る」経路は構造上存在しない。逆に**戻る処理で `endWalk()` を呼ぶのは禁止**
（散歩中 → 記録タブ → `/walk-history` 空状態 CTA → `/walk-start` の経路で進行中の散歩を巻き添えにする）。
Query キャッシュ（`useSpotCandidates` gcTime 30分 / `useWalkRoute` gcTime 2時間）は**意図的に残す**
（再探索は backend で1回あたり最大21回の外部呼び出し）。

Related: [[mobile-structure]], [[project-walk-domain-contract]], [[project-e2e-ci-constraints]]
