---
name: feature-flag-app-config-pattern
description: SS-100で確立した/app-configフィーチャーフラグ受け皿のパターン(TanStack Query一本化・キー定数の写し・pending/enabled/disabled判定・AppState購読の配線コンポーネント)
metadata:
  type: feedback
  scope: durable
---

SS-100 で `packages/mobile/src/api/appConfigQueryKey.ts` / `appConfigApi.ts`、
`src/config/featureFlags.ts`、`src/lib/appConfigSnapshot.ts` / `featureGate.ts` /
`appConfigRefresh.ts`、`src/hooks/useAppConfig.ts` / `useAppConfigBootstrap.ts` /
`useFeatureFlag.ts`、`src/components/app-config/AppConfigBootstrap.tsx` / `FeatureGate.tsx` を新設。
詳細な設計判断は `docs/adr/ADR-008-deploy-release-separation.md`（ルート、D11〜D18）と
`packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md`（SS-100 追補）に記録済み。

## 構造上のポイント（今後フラグを増やす/参照する側が踏襲すること）

1. **保持は TanStack Query の1本（`queryKey: ["app-config"]`）のみ**。Zustand へ複製しない。
   `/app-config` は未認証でも叩けるサーバー状態なので `AuthGate` の外でも取得できる。
2. **キー定数（`FEATURE_FLAG_KEYS`）は backend 登録簿の手書きの写し**。自動同期はしない。
   ズレても壊れないよう `isFeatureEnabled()` は `flags[key] === true` の厳密比較のみで判定し、
   未知キー・非 bool 値は常に false。
3. **`AppConfigSnapshot` に `config_source` を意図的に持たせない**。診断専用の値をプロダクト型から
   型レベルで落とすことで「分岐に使ってはいけない」制約を構造的に守らせている
   （診断だけは別 hook `useAppConfigDiagnostics()` から読む）。
4. **`status: "loading" | "ready" | "unavailable"` の3値を必ず区別する**。画面ごとフラグで隠す
   （`<Redirect>` する）用途では `resolveFeatureGateDecision()` が返す `pending` を経由させ、
   ロード中に確定的な OFF 扱いをしない（「フラグ ON なのに起動直後は必ず弾かれる」事故を防ぐ）。
   ただし `isFeatureEnabled()` 自体はロード中も false を返す（`useFeatureFlag()` の既定はこちら）。
5. **`AppConfigBootstrap`（null 返却の配線コンポーネント）を `QueryClientProvider` 直下・
   `<Stack>` の外（兄弟）に置く**。`AuthGate` と同じ理由（hook は Provider 内側でしか呼べないが
   `RootLayout` 本体は外側にあるため）。`AppState` の購読は `useAppConfigBootstrap` の1箇所に閉じ、
   `useAppConfig()` 側には置かない（呼び出し元の数だけ購読が増えるのを防ぐ）。
6. **永続キャッシュ（AsyncStorage 等）を持たせない**。フェイルセーフ「読めない時は OFF」を
   前回起動時の値で上書きしてしまうと kill switch が効かなくなる。
7. **`src/services/` の real/mock 層は作らない**。HTTP で完結しネイティブ/認証依存が無いため、
   ユニットテストは Orval 生成 msw、E2E は実 backend で足りる。ローカルでの ON/OFF 切り替えは
   backend 側の `FEATURE_FLAG_MODE=stub` + `FEATURE_FLAG_STUB_DOCUMENT` で行う
   （mobile 側に別の切り替え環境変数を増やすと正典が2つになる）。

## サインアウト時クリアからの除外パターン（[[session-cleanup-registry]] の拡張）

`/app-config` はユーザー非依存のため、`src/api/queryClient.ts` のサインアウト時後始末を
`queryClient.clear()` から `queryClient.removeQueries({ predicate: (q) =>
!isAppConfigQueryKey(q.queryKey) })` + `queryClient.getMutationCache().clear()` に変更した。
**「新しいキャッシュは既定でクリア対象、除外は predicate で明示列挙」という fail-safe の向きは
維持している**。除外してよい条件は「ユーザー非依存であること」に限る（ADR-008 追補 D2 が
ダークローンチ＝ユーザー条件付きフラグを不採用としているために成立している前提）。

## `shouldRefreshOnForeground` は `dataUpdatedAt` だけで判定しない（PR #89 Copilot 指摘で修正）

`dataUpdatedAt` は TanStack Query の仕様上**成功時にしか更新されない**。フォアグラウンド復帰の
再取得を絞る判定（`src/lib/appConfigRefresh.ts`）をこれ単体で行うと、取得が失敗し続けている間
（初回失敗は永久に0、成功後の失敗は古い成功時刻のまま前進しない）は「最小間隔60秒」の絞りが
**障害中にだけ無効化される**という壊れ方をする。1回の `invalidateQueries` は transport の
retry（`transientRetry.ts` 最大3）× TanStack の `retry: 2`（最大3）で最悪9リクエストになりうる
ため深刻。

修正: 判定の起点を `lastAttemptedAt = Math.max(dataUpdatedAt, errorUpdatedAt)`
（直近の**成功または失敗**の時刻）にし、`isFetching`（`fetchStatus === "fetching"`）なら
実行中の再取得に重ねて発火しないよう false を返す。呼び出し側は `getQueryState()` から
`dataUpdatedAt` / `errorUpdatedAt` / `fetchStatus` の3つを渡す。フェイルセーフの向き
（値が読めない間は全フラグ OFF、ADR-008 決定9）は変えない — これは「無駄打ちを減らす」修正。
**教訓: TanStack Query のポーリング/復帰系の間隔制御を書くときは、成功時刻だけでなく
`errorUpdatedAt` と `fetchStatus` も必ず検討する。**

## FeatureGate の `pending` は `??` ではなく `=== undefined` で判定する（PR #89 Copilot 指摘で修正）

`ReactNode` の props で「未指定なら既定値」を実装するとき `??`（nullish coalescing）を使うと
`null`（明示的に「何も描画しない」という有効な値）まで既定値に倒してしまう。
`FeatureGate.tsx` の `pending` は `pending === undefined ? fallback : pending` のように
`undefined` だけを明示チェックする必要がある。**教訓: `ReactNode` 型の optional prop で
「未指定」と「明示的な null」を区別したい場合は `??` を使わない。**

## テストの落とし穴: `queryClient.test.ts` で `resetSessionCleanupForTest()` を呼ばない

`queryClient.ts` はモジュール読み込み時の副作用として `registerSessionCleanup(...)` を実行する。
vitest はテストファイルごとにモジュールを隔離して読み込む（`pool: threads` の isolate）ため、
そのテストファイル内では他ファイルの登録と混ざらない。`sessionCleanup.test.ts` の作法
（`beforeEach` で `resetSessionCleanupForTest()` を呼んでからレジストリの単体動作を検証する）を
そのまま持ち込むと、`queryClient.ts` の実際の登録まで消えてしまい「何もテストしていない」
状態になる。**モジュール副作用としての登録を検証したいテストでは reset を呼ばず、import 直後の
状態のまま `runSessionCleanup()` を呼ぶ**。
