---
name: feature-flag-app-config-pattern
description: /app-configフィーチャーフラグ受け皿(SS-100)を触るときの教訓(TanStack Queryの間隔制御はerrorUpdatedAt/fetchStatusも見る・ReactNode optional propで??を使わない・queryClient.testでresetしない)。設計判断の正本はADR-008/ADR-M-009
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-008-deploy-release-separation.md
---

設計判断（保持は TanStack Query `["app-config"]` の1本のみ・永続キャッシュを持たない・
`FEATURE_FLAG_KEYS` は backend 登録簿の写し・`flags[key] === true` の厳密比較・`config_source` を
内部型から落とす・`services/` の real/mock 層を作らない・`AppConfigBootstrap` の配置と AppState 購読の
1箇所化・`loading/ready/unavailable` の区別と `resolveFeatureGateDecision()` の `pending`）は
`docs/adr/ADR-008-deploy-release-separation.md`（SS-100 追補 D11〜D18。冒頭の要約から読む）が正本。
サインアウト時クリアから `/app-config` を除外する件は
`packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md`（SS-100 追補）と
[[auth-session-and-cleanup]]。ローカルでの ON/OFF は backend の `FEATURE_FLAG_MODE=stub` で切り替える
（mobile 側に切り替え用 env を増やさない）。

## 教訓1: TanStack Query の間隔制御は成功時刻だけで判定しない（PR #89）

`dataUpdatedAt` は**成功時にしか更新されない**。フォアグラウンド復帰の再取得を絞る判定
（`src/lib/appConfigRefresh.ts`）をこれ単体で行うと、取得失敗が続く間だけ「最小間隔60秒」が無効になる
（`invalidateQueries` 1回が transport の再送 × TanStack の `retry` で最悪9リクエストになりうる）。
起点は `lastAttemptedAt = Math.max(dataUpdatedAt, errorUpdatedAt)` にし、`fetchStatus === "fetching"`
なら重ねて発火しない。**ポーリング/復帰系の間隔制御では `errorUpdatedAt` と `fetchStatus` も必ず検討する。**

## 教訓2: `ReactNode` の optional prop の既定値に `??` を使わない（PR #89）

`??` は明示的な `null`（「何も描画しない」という有効な値）まで既定値に倒す。`FeatureGate.tsx` の
`pending` のように `pending === undefined ? fallback : pending` と `undefined` だけを判定する。

## 教訓3: モジュール副作用の登録を検証するテストでは reset を呼ばない

`queryClient.ts` は読み込み時に `registerSessionCleanup(...)` を実行する。vitest はテストファイルごとに
モジュールを隔離するため混ざらない。`sessionCleanup.test.ts` の作法（`beforeEach` で
`resetSessionCleanupForTest()`）をそのまま `queryClient.test.ts` に持ち込むと実際の登録まで消え、
何もテストしていない状態になる。import 直後の状態のまま `runSessionCleanup()` を呼ぶ。
