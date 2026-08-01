---
name: project_ss19_walk_finish
description: SS-19（散歩終了処理・散歩ルート保存/POST walks 保存フロー）レビュー時点の実装状況と確認済みの設計整合ポイント
type: project
---

`tmp/SS-19/mobile-plan.md`（§3 サマリ画面で1回保存する案A採用・§4 軌跡整形・§7 各ファイル仕様・§8.3
ローカル永続化スコープ外）に基づき、`useFinishedWalkStore`（保存待ちドラフト）/ `useWalkSave`（useMutation
ラッパ、自動発火+再試行）/ `walkApi.saveWalk`（POST /walks）/ `lib/{finishedWalk,walkTrackPayload,
walkCreateRequest,walkSaveError}`（すべて純粋関数）/ `src/lib/uuid.ts`（client_walk_id 採番）が実装済み
（2026-08-02時点でレビュー、ブランチ `feat/ss-19-walk-finish`。関連: [[project_ss16_walk_route]]）。

**環境上の注意（再掲、今後も起こりうる）:**
- この環境では Bash ツールが使えず `git diff` を直接実行できない。`tmp/<SS-番号>/mobile-plan.md` の
  「§作成・編集・削除するファイルのツリー」を対象ファイルリストとして使い、Glob/Grep/Read で実ファイルを
  直接検証するアプローチが有効（SS-16 と同じ手法）。

**確認できた良好パターン（今後のレビューでも踏襲を期待してよい）:**
- 「サーバー保存はサマリ画面到達後に1回だけ実行する」設計（散歩中画面ではなくサマリ画面で
  `useMutation` を発火）が、プランの案B/C比較（発火直後にアンマウントされ状態が失われる／
  retry・backoff を自前実装することになる）を踏まえた妥当な判断として実装に反映されている。
  `useWalkSave` の自動発火は `saved`（Zustand、画面をまたいで永続）+ `useRef` の `clientWalkId`
  二重ガードで、StrictMode 二重実行・冪等再送のいずれにも耐える構造。
- `useFinishedWalkStore`（保存待ちドラフト）と `useActiveWalkStore`（進行中の識別情報。ADR-008）が
  明確に責務分離されている。前者の「サーバー由来データを置かない」規律への唯一の例外は `savedWalkId`
  （識別子1つ）とコメントで明示。
- `lib/finishedWalk.ts` / `lib/walkTrackPayload.ts` / `lib/walkCreateRequest.ts` / `lib/walkSaveError.ts`
  はすべて `react-native` 非値import の純粋関数。`GeoCoordinates`/`GeoPoint` はすべて `import type`。
  `services/location` バレルの値 import は従来どおり `useWalkTracking.ts`/`useCurrentLocation.ts` の
  2箇所のみに限定されたまま（新規 `lib/`・`api/` からの逸脱なし）。
- `walkApi.ts`（`saveWalk`）は `exploreApi.ts`/`walkRouteApi.ts` と同じ「素の fetcher、hook を使わない」
  方式を踏襲。`services/auth` を import せず `customFetch` の `authTokenProvider` 経由に統一する既存方針
  とも整合。`useQueryClient()` フックから取得（`@/api/queryClient` シングルトン直import はしない）。
- `client_walk_id`（冪等キー）は散歩開始時（`WalkStartView.handleStartWalk`/`ScreenCatalog`）に
  `randomUuidV4()` で採番し、終了・再送でも変えない（ADR-003 D3 の申し送り通り）。
- `buildFinishedWalk`/`buildWalkCreateRequest` の境界値テストが `WalkCreate` の Orval 生成スキーマ
  （`@minimum`/`@maximum`/`@maxLength`）と1対1対応。バックエンドのバリデーションを先回りしてローカルで
  弾く「送れないなら null を返す」規約（既存 `buildWalkingRouteRequest`/`buildPlaceSearchRequest` と同型）
  を踏襲。

**既知の残課題（Warning/Suggestion 相当、今後の関連PRで再確認すること）:**
- `useFinishedWalkStore.ts` の `savedWalkId` JSDoc（「200 replay で本文が取れなければ null のまま」）が
  実装と食い違っている。実際に再生成された Orval 型では `createWalkWalksPostResponse200` がすでに
  `data: WalkRead` を持ち、`saveWalk()` は 200/201 いずれも非null の `WalkRead` を返す
  （プラン §5.3 が想定していた「backend への軽微な依頼」は実装時点で解消されていたと見られる）。
  SS-20 実装時に「savedWalkId は null になりうる」という古い前提でコードを書かないよう要確認。
- `clearFinishedWalk` アクション（ストア + テストのみ存在）がどこからも呼ばれていない
  （`WalkSummaryView` の「記録を見る」「ホームへ」ハンドラは `router.replace` のみ）。次の散歩開始時に
  `finishWalk()` で上書きされるため実害は小さいが、死んだコードとして残っている。SS-20 以降で
  「サマリを離れたら明示的に片付ける」設計にするか、不要なら削除するか判断が必要。
- 保存中（`useWalkSave` の mutation が pending）にサマリ画面を離れて（再訪等で）再マウントされると、
  `firedClientWalkIdRef` がリセットされ二重 POST が発生しうる。`client_walk_id` の冪等性により
  データ破損は起きないため、プラン §3.2 で許容済みのトレードオフ（対応不要）。
