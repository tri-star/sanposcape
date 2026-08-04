---
name: screen-back-navigation-pattern
description: 画面の「戻る」導線（ボタン+Androidシステムバック+連打ガード）を実装するときはsrc/hooks/useScreenBack.tsに一本化する（SS-34で導入）
metadata:
  type: project
---

SS-34で「画面から出る」操作の共通パターンを整備した。以後、戻るボタン付きの画面を
新規追加・改修するときはこれを再利用する。

## 構成（[[promotion-workflow]] と同じ判定: 純粋関数はlib、RN依存はhooks）

- `src/lib/backNavigation.ts` — `resolveBackAction({intercepted, navigating, canGoBack})`。
  react-native/expo-routerを値・型ともにimportしない純粋関数。優先順位は
  `intercepted > navigating > canGoBack`（この順で早期return）。
  - `intercepted`を`navigating`より先に見るのが肝: 遷移ラッチが立っていてもBottomSheet等は
    必ず閉じられなければならない（逆にすると「戻るを押してもシートが閉じない」詰みになる）。
  - `.test.ts`で8パターン（`it.each`表形式、[[test-scope-hooks-components]]の方針どおり）を
    固定している。
- `src/hooks/useScreenBack.ts` — `{fallbackHref, onIntercept?}` を受け取り
  `{goBack, runOnce}` を返す。`react-native`（`BackHandler`）を値importするため
  **`.test.ts`を作らない**（[[test-scope-hooks-components]]のhooks除外方針に従う）。
  - `useFocusEffect`（`expo-router`がre-export）の中で`BackHandler.addEventListener`を購読する。
    `useEffect`で購読すると上に別画面が積まれている間もリスナが生き残り、上の画面のバックを奪う。
  - `BackHandler.removeEventListener`はRN 0.86に存在しない。`addEventListener`の戻り値
    （`NativeEventSubscription`）の`.remove()`を使う。
  - ラッチは`useRef<boolean>`（stateにしない。再レンダーを挟むと連打に間に合わない）。
    `useFocusEffect`のフォーカス時に解除する（遷移が実際に起きなかった場合の詰み防止）。
  - `runOnce(navigate)`で「戻る」と「その画面から出る他の遷移」（例:
    `WalkStartView`の「散歩を始める」）が同じラッチを共有する。連打・同時押しで
    両方の遷移が走る事故を防ぐ。
  - `onIntercept`は「毎レンダー最新の関数をrefに載せる」ため呼び出し側で`useCallback`
    不要（`interceptRef.current = onIntercept`を直接レンダー中に代入。
    `features/walk/hooks/useWalkTracking.ts`のpausedRefと同じ手法）。

## 前提条件

- `app.json`の`expo.android.predictiveBackGestureEnabled: false`が前提。trueにすると
  `hardwareBackPress`でtrueを返す方式が効かなくなるため、変える場合はhookごと見直す。
- 戻り先の規約は`docs/pages-components-guideline.md`の
  「画面の「戻る」導線の規約」節に明文化済み。戻るボタンの見た目は
  `IconButton`の`icon="chevron-left" / label="戻る" / variant="ghost"`で統一する。

## 適用例（3画面）

- `WalkStartView`（`fallbackHref: "/(tabs)"`）— `onIntercept`でカテゴリシートを閉じる。
  「散歩を始める」も`back.runOnce`でラッチ共有。
- `WalkHistoryListView` / `WalkDetailView`（`fallbackHref: "/(tabs)/history"`）—
  重複していたローカル`handleBack`（`canGoBack() ? back() : replace(...)`）を置き換え。
  testID（`walk-history-back` / `walk-detail-back`）とfallbackHrefは既存Maestroフロー
  互換のため据え置き。

## 注意: 戻る操作でストアを触らない

散歩開始前の画面ローカル状態（`useWalkPlan`のdurationMin/カテゴリ/選択スポット等）は
すべて`useState`のみなので、画面がアンマウントされれば自動で消える。**明示的なクリア
関数を足さない**（消し方が2通りになり漏れの温床になる）。
戻る処理で`useActiveWalkStore.endWalk()`のような進行中データを破棄する操作を
**絶対に呼ばない**。履歴の空状態CTA経由で`/walk-start`に入り込む経路があるため、
安易に「戻ったら状態クリア」を書くと進行中の散歩を巻き添えで壊す。
