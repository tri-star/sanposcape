---
name: location-permission-review
description: 位置情報の権限・精度・審査（5.1.1(iv)/5.1.5/2.5.4）のプランで踏みやすい事実 — pre-prompt の審査の実例、Android の拒否が undetermined に写る、前面復帰時に requestPermission を呼ぶとダイアログが繰り返し出る、expo-location の精度 API
metadata:
  type: feedback
  scope: durable
  source_issue: SS-160
  verify_by: 2027-04-30
---

SS-160 の計画で、コード・expo-location 57 のソース・Apple Developer Forums を読んで確認した（2026-10-12）。
決定とその理由は `packages/mobile/adr/ADR-M-022-location-permission-flow-and-approximate-location.md` にある。

- **Android の1回目の拒否は `"undetermined"` に写る**（`location.real.ts` の `toPermissionStatus` が
  `canAskAgain` を見るため）。iOS の拒否は `"denied"`。したがって「状態が undetermined なら requestPermission」
  という処理を前面復帰などで自動で走らせると、Android では復帰のたびにダイアログが出る。
  自動の処理は `getPermissionStatus` で状態を見るだけにし、要求は利用者の操作に限る。
- OS の権限ダイアログの開閉でも、AppState は inactive / background → active と変わる。AppState をきっかけにする
  処理が要求まで行うと、ループになりうる。
- **expo-location 57 は精度の許可を返す**: `getForegroundPermissionsAsync()` の `ios.accuracy`（full / reduced）と
  `android.accuracy`（fine / coarse / none）。一方、`requestTemporaryFullAccuracyAuthorization` は無い
  （57.0.15 のソースと 57.0.20 までの CHANGELOG で確認）。「一時的に正確な位置を求める」案は書かない。
- **pre-prompt（独自の事前説明画面）の審査の実例**: ボタンの文言（「Configure Location Access」）でリジェクトされた例と、
  「Not Now」などの出口があってリジェクトされた例がある（forums thread 757532 / 817672）。
  Apple の指示は「Continue / Next を使う」「メッセージの後は必ず権限の要求へ進む」。
  一方で「位置情報が無いと動かない機能なら、通知と Settings へのリンクを出してよい」とも書かれている。
  拒否時にローディングが止まらないと、2.1 でリジェクトされる。
- 5.1.1(iv) の本文には「拒否した人には可能なら代替を（例: 住所の手入力）」がある。プランでは、代替の有無を機能ごとに書く
  （このアプリでは、ピンは長押しで代替できる。散歩の記録は代替できない）。
- vitest の `src/test/mocks/expo-location.ts` には `PermissionStatus` の enum が無い。real の権限まわりを
  テストするなら、`result.granted`（boolean）を使うか、モックに足す。

**Why:** どれもコードの見た目やドキュメントからは分からない。どれも、外すと「無限に要求する」「審査で落ちる」になる。

**How to apply:** 権限・精度・審査対応のプランでは、自動の処理が `requestPermission` に届かないことを確かめる。
pre-prompt を提案するなら上の制約を書く。精度を扱うなら `getForegroundPermissionsAsync` の `ios` / `android` を使う。

Related: [[native-config]], [[testing-and-e2e]]
