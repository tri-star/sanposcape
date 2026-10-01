---
name: project-navigation-model
description: mobile のルートスタックの実態（どこで canGoBack が false になるか）と Android バック対応の前提
metadata:
  type: reference
  scope: durable
---

ナビゲーション/導線まわりのプランで毎回効く、コードを読まないと分からない事実（2026-08 / SS-34 の調査で確認）。

## スタックの実態

- **主要導線は `replace` の連鎖**: `/`(スプラッシュ) → `replace` `/(auth)/sign-in` → `replace` ピンタブ `/(tabs)/pins`
  （SS-145 で着地点が `/walk-start` から変わった。正本は ADR-M-009 の SS-145 追補）。
  → **着地した時点で `router.canGoBack() === false`**。`/walk-start` ⇄ `/(tabs)` は互いに `replace`
  （`WalkIdleNotice` の CTA が `replace("/walk-start")`）なので、往復してもスタックは1枚のまま伸びない。
  タブ内の Android バックは `Tabs` の `backBehavior`（既定 `firstRoute`＝ナビタブへ戻ってから終了）に従う。
- **アプリの既定ホームは `(tabs)`**（ナビ `index` / ピン `pins` / アカウント `account`。SS-145 以降）。`WalkSummaryView` の「ホームへ」も
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

## タブまわりの確認済みの事実（SS-145 で node_modules を読んで確認・2026-09-29）

- **`Tabs.Screen` の `href: null` は独自の `AppTabBar` には効かない**。expo-router（`build/layouts/TabsClient.js`）は
  `href` を `tabBarButton` / `tabBarItemStyle` に変換するだけで、`AppTabBar` は自分の項目リストを描く。
  タブを隠すときは `AppTabBar` 側の項目リストから外す（`features/navigation/lib/appTabs.ts`。SS-145 で
  `docs/architecture-guideline.md` のレシピも訂正済み）。
- **expo-router の `<Redirect>` は `useFocusEffect` の中で `replace` する**（`build/link/Redirect.js`）→ フォーカス中の
  画面でしか動かない。タブ内の画面ガードが、別タブにいるユーザーを引き戻すことはない。
- `Tabs` の `backBehavior` の既定は `firstRoute`（`build/react-navigation/routers/TabRouter.js`）。
- `"/(tabs)"` は `(tabs)/index`（ナビタブ）に解決される（`app/index.tsx`＝スプラッシュの `/` とは別物）。
- `pin_registration` の画面ガードは `usePinRegistrationGate()`（SS-145）に集約されている。新しいピン系ルートもこれを使う。
- **タブ画面は一度開くとマウントされたまま残る**（ADR-M-012 SS-146 追補）。同じ feature コンポーネントを2つのタブに出すと
  固定 testID が同時に2つ存在しうる → 呼び出し側から接頭辞を渡す形にし、既存 E2E が使う既定値は据え置く
  （`pages-components-guideline.md` ルール7。SS-147 の `RecentWalksSection` の計画で判断）。
- ナビタブ（`app/(tabs)/index.tsx`）は feature 合成の集積点: `features/pin`（`renderMapLayers`）と
  `features/history`（idle の「最近の散歩」。SS-147 の計画）をルートが slot で渡す。`features/walk` はどちらも import しない。

## 中間画面から `/pins/new` へ進むときは replace（SS-124 の計画で判明）

`PinRegisterView` の保存後・破棄後は `canGoBack() ? back() : replace("/(tabs)")`。ナビタブの
「ピンを保存しました」は `WalkActiveView` の `useFocusEffect` → `consumeFlashMessage()`。
→ 地点選択のような中間画面から `/pins/new` へ `push` すると、戻り先が中間画面になってトーストも出ない。
**中間画面 → `/pins/new` は `replace`** にしてスタックを `(tabs) → pins/new` に保つ。
Expo Router には「前の画面へ結果を返す」正式な手段が無い。登録画面の状態を保ったまま子画面の結果を
受け取りたいときは、ルートを増やさず画面内のオーバーレイで済ませるのが一番安い
（RN `Modal` はハードウェアバックを `onRequestClose` で先に取り、`useScreenBack` の `onIntercept` が
届かない。`Modal` の中の `MapView` には Android で不具合報告もある: react-native-maps #3890 / #4893）。

## flash トーストは「消費する画面」でしか出ない（SS-119 で確認）

`setFlashMessage` を消費するのは `WalkActiveView`・`PinTabView`・`PinDetailView`・`SanpoMapDetailView` の
`useFocusEffect`（後ろの2つは SS-119 で追加。2026-10 時点）。
ピン詳細は地図詳細（`SanpoMapDetailView`）からも開かれるので、詳細から戻る遷移で flash を使うなら戻り先すべてに
消費を足す。足さないと文言が残り、次にピンタブへフォーカスしたとき遅れて出る。

## タブ画面から Stack 画面へ出るときの前提（SS-146 の計画で整理）

- **タブ画面から `/pins/new` 等へは push**。タブ画面の下は `(tabs)` ルートそのものなので、replace すると
  `(tabs)` ごと置き換わってタブバーが消える。push ならスタックは `(tabs) → 子` になり、子の
  `canGoBack() ? back() : replace(...)` でフォーカス中だったタブへ戻る（上の「中間画面 → replace」とは逆の結論になる）。
- **タブ画面で `useScreenBack` を使わない**。`hardwareBackPress` を奪い、`backBehavior: firstRoute` の既定を変えてしまう。
  二重遷移の防止が要るなら、`BackHandler` を購読しない `src/hooks/useNavigateOnce`（`useScreenBack` も内部で使う。
  フォーカスで解除）を使う。画面内に自前のラッチを書かない（SS-146 のレビューで重複を指摘され共通化した）。

## 散歩開始「前」に副作用が無いことの根拠

`clientWalkId` 採番・`useActiveWalkStore.startWalk()` は `WalkStartView.handleStartWalk` の中だけ。
`watchPosition` は `useWalkTracking`（`enabled: activeWalk !== null`）のみ。`/walk-start` は
`getCurrentPosition()` の単発だけ。`useWalkPlan` の状態は全部 `useState`（アンマウントで消える）。
→ 「戻ったら開始状態が残る」経路は構造上存在しない。逆に**戻る処理で `endWalk()` を呼ぶのは禁止**
（散歩中 → 記録タブ → `/walk-history` 空状態 CTA → `/walk-start` の経路で進行中の散歩を巻き添えにする）。
Query キャッシュ（`useSpotCandidates` gcTime 30分 / `useWalkRoute` gcTime 2時間）は**意図的に残す**
（再探索は backend で1回あたり最大21回の外部呼び出し）。

Related: [[mobile-structure]], [[project-walk-domain-contract]], [[project-e2e-ci-constraints]]
