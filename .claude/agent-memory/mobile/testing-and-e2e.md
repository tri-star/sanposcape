---
name: testing-and-e2e
description: Vitest と Maestro で踏む点 — 副作用登録のテストで reset しない、disabled を押しても Maestro は失敗しない、config.yaml を書かない、地図の中心はピンに当たる、既存 testID のリネーム禁止、appId のハードコード
metadata:
  type: feedback
  scope: durable
---

テストの層・msw・E2E のモードは `packages/mobile/docs/architecture-guideline.md`「テストの方針」と
`pages-components-guideline.md`「テストの書き方」、E2E の実行方式は ADR-M-004 が正本。ここには正本に無い挙動と落とし穴を置く。

## Vitest

- **モジュール読み込み時の登録を確かめるテストでは reset を呼ばない。** `queryClient.ts` は読み込み時に `registerSessionCleanup(...)` を実行する。
  `sessionCleanup.test.ts` の作法（`beforeEach` で `resetSessionCleanupForTest()`）を持ち込むと実際の登録まで消え、何もテストしなくなる。
  Vitest はテストファイルごとにモジュールを隔離するので、import 直後の状態のまま `runSessionCleanup()` を呼べばよい。
- ピンチなどのジェスチャーは Maestro で打てない（2本指は不可）。計算を worklet の純粋関数にして Vitest で検証し、実機で手動確認する。

## Maestro の挙動（ドキュメントに書かれていないもの）

- **disabled なボタンをタップしても Maestro は失敗せず次へ進む**（`Button` は `Pressable disabled`）。
  押せる状態になったことを示す testID（例: `walk-start-route-summary-ready`）を待ってからタップする。
- `assertVisible` の待ちは短い。通信・画面遷移をまたぐ箇所は `extendedWaitUntil`（`visible` / `notVisible` + `timeout`）にする。
- **`.maestro/config.yaml` は作らない。** `flows` の glob を書き損ねると「1本も実行されないのに緑」になる。既定（直下の yaml を全部）で足りる。
- タグの絞り込みは CLI の `--include-tags` / `--exclude-tags` がフローヘッダの `tags:` に効く（CI は絞り込まない）。
- 1つのシナリオで状態が連続するフローは分割しない。`useActiveWalkStore` などはアプリ再起動をまたいで残らない。

## E2E の書き方の落とし穴

- **件数・空状態は assert しない**（E2E ユーザー `e2e-user-1` と DB は CI ラン内で共有）。「`*-loading` が消える」+「`*-error` が出ない」の2段で、取得が成功して落ち着いたことだけを見る。
- 作ったものを確かめたいときは、フロー内で一意な名前のデータを作ってそれだけを見る。`evalScript` + `${output.*}` で名前を作る案は未検証なので、使う前に動かして確かめる。
- **地図の中心を長押し・タップする手順は登録済みピンに当たりうる。** `e2e-user-1` のピンは mock の現在地（= 地図の中心）に溜まり、`MapPin` は座標の上側に描かれる。地図そのものを押すときは中心より下の `point` を使う。
- 外部ブラウザを開く導線（プライバシーポリシー等）は押さず、存在だけを assert する。

## 変更前に確認すること

- **`appId`（`com.sanposcape.app.dev`）と `openLink` の scheme（`sanposcape-dev://`）は複数のフローにハードコードされている。**
  件数は `rg -l 'com\.sanposcape\.app\.dev' packages/mobile/.maestro` で数える。識別子・scheme を変える案はこれとセットで見る（SSoT は `docs/build-profiles.md`「アプリ識別子の定義」）。
- **既存の testID はリネームしない**（現行フローが依存）: `splash-screen` / `sign-in-google-button` / `walk-start-screen` / `walk-start-duration-slider` /
  `walk-start-begin` / `settings-screen` / `settings-open-logout-dialog` / `logout-dialog` / `settings-confirm-logout` / `walk-start-route-summary-ready` / `walk-active-route-legend`。
  増減するので、変える前に `rg` で `.maestro/` の参照を確かめる。
- `packages/backend/compose.yaml` は環境変数を1つずつ列挙して渡す。backend に env を足して E2E で使うときは compose.yaml にも足す。
- E2E を変える PR は自動では走らない（週次と手動だけ）。マージ前に `workflow_dispatch` で手動実行する。

Related: [[navigation]], [[maps]]
