---
name: pattern_modal_backhandler_coexistence
description: RN Modal(Android)がonRequestCloseで先にハードウェアバックを奪うため、useScreenBackのonInterceptがModal表示中は事実上呼ばれない既知の挙動
metadata:
  type: feedback
  scope: durable
---

`src/components/ui/dialog/Dialog.tsx`（RN `Modal` ベース）と `src/hooks/useScreenBack.ts`
（`BackHandler.addEventListener("hardwareBackPress", ...)` ベース）が同一画面に同居するケースが
SS-60（散歩履歴削除ダイアログ、`WalkDetailView.tsx`）で初めて発生した。

**Why:** React Native の既知の挙動として、Android で `Modal visible={true}` の間は
`BackHandler` の `hardwareBackPress` イベントが発火しない（Modal 自身の `onRequestClose` が
先にハードウェアバックを消費するため。facebook/react-native issue #19147、
react-native-modal issue #623 で報告されている）。そのため `WalkDetailView` が
`useScreenBack({ onIntercept })` に実装した「ダイアログが開いていたら閉じる」という分岐は、
Android のハードウェアバック経由では**実質到達しない**可能性が高い（実際にモーダルを閉じる
役割は `Dialog` の `onRequestClose={dismissDisabled ? noop : onClose}` が独立に担っている）。
結果的に見た目の挙動は収束する（どちらの経路でも「削除中でなければ閉じる」になる）ため
バグではないが、`backRef` を使った宣言順の工夫（TDZ 回避）は主に到達しない分岐のために
複雑さを増やしている可能性がある。

**How to apply:** 今後 `useScreenBack` の `onIntercept` と `Modal`/`Dialog` が同居するコードを見たら、
実機/エミュレータの Android ハードウェアバックで `onIntercept` 側が本当に呼ばれるか
（`console.log` や Maestro で）検証することを提案する。呼ばれないなら、
コメントを「両者が協調する」ではなく「Modal 表示中は Dialog 側が主、onIntercept はその他の
離脱経路（プログラム的な `goBack()` 呼び出し等）向けの保険」と明確化するよう提案する。

関連ファイル: `packages/mobile/src/components/ui/dialog/Dialog.tsx`,
`packages/mobile/src/hooks/useScreenBack.ts`,
`packages/mobile/src/features/history/components/WalkDetailView.tsx`。

**2026-09-25 追記（SS-124、ポジティブな適用例）**: `PinLocationAdjustOverlay.tsx`（位置調整の
全画面オーバーレイ）は、この既知の問題を ADR-011 D7 で明示的に引用したうえで **RN `Modal` を
使わない**設計（`position: absolute` の素の `View`）を選んでいる。理由は「`Modal` 内の
`MapView` の Android 不具合（react-native-maps #3890/#4893）」と「`Modal` が
`onIntercept` を届かなくする」の両方。`PinRegisterView.tsx` の `useScreenBack({ onIntercept })`
は `adjustOpen` 分岐を `discardOpen`（`Dialog`＝`Modal` ベース、この既知の問題が引き続き
残る）より先に置いており、"新規に追加するオーバーレイは `Modal` を避けて `onIntercept` を
実際に機能させる" という設計判断の実例として今後の参照に使える。`discardOpen` 側は
`PinRegisterView.tsx` 内のコメントで「Modal 表示中は Dialog 側が主、onIntercept は保険」と
明確化済み（本メモリの How to apply で提案していた内容が実装済み）。
