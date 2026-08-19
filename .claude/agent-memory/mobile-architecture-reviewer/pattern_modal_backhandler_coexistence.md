---
name: pattern_modal_backhandler_coexistence
description: RN Modal(Android)がonRequestCloseで先にハードウェアバックを奪うため、useScreenBackのonInterceptがModal表示中は事実上呼ばれない既知の挙動
metadata:
  type: project
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
