---
name: project_ss16_walk_route
description: SS-16（候補スポット選択→徒歩ルート提示→散歩開始・散歩中トラッキング）レビュー時点の実装状況と確認済みの設計整合ポイント
type: project
---

`tmp/SS-16/mobile-plan.md` に基づき、`services/location` への `watchPosition` 追加、
`features/walk/{api,hooks,lib,store,components}` の新規・拡張一式（`useWalkRoute` / `useWalkTracking` /
`useActiveWalk` / `useActiveWalkStore` 等）が実装済み（2026-08-01時点でレビュー、ブランチ
`feat/ss-16-walk-route`）。

**環境上の注意（今後のレビューでも起こりうる）:**
- このレビュー時、gitStatus のスナップショットは `main` ブランチだったが、実際のワーキングツリーには
  SS-16 の全ファイルが存在していた（ブランチ切り替え後にスナップショットが更新されていなかった模様）。
  Bash ツールが使えない環境だったため `git diff` は実行できず、`docs/*` のファイルツリー記述とプランの
  「§4 作成・編集・削除するファイルのツリー」を突き合わせて対象ファイルを特定し、Read/Grep で直接検証した。
  同様の制約下では、プランの§4相当のファイルリストを頼りに実ファイルを1つずつ読むアプローチが有効。

**確認できた良好パターン（今後のレビューでも踏襲を期待してよい）:**
- サーバー状態（`WalkRoute` 本体）= TanStack Query、進行中の散歩の識別情報（`ActiveWalk`）= Zustand
  という [[folder-structure]] の使い分けが実コードで徹底されている。`useActiveWalkStore` は
  `origin`/`destination`/`roundTripMinutes`/`roundTripKm`/`startedAtMs` のみを持ち、ルート本体を
  複製しない。
- 散歩開始画面（`useWalkPlan`）と散歩中画面（`useActiveWalk`）が**同じ `origin`/`destination` 入力**で
  `useWalkRoute` を呼ぶことで、TanStack Query のキャッシュ（同一 `queryKey`）に当たり API 呼び出しを
  1回に抑える設計になっている。`origin` は選択時の生の座標をそのまま `ActiveWalk.origin` に格納し、
  `buildWalkingRouteRequest` 側でのみ小数4桁に丸めることで queryKey の安定性を確保している
  （GPS の揺れでキャッシュキーがブレない）。
- `services/location` は `real`/`mock` の2モードのみ（ADR-006 で意図的に `dev` を持たない設計）。
  `expo-location` を import するのは `location.real.ts` のみ、単体テストでは `@/services/location`
  バレルではなく `location.mock.ts` を直接 import する規律が守られている（`lib/` からのバレル
  import はゼロ、`useWalkTracking.ts`/`useCurrentLocation.ts` の2 hook のみが対象）。
- `useWalkTracking` の `watchPosition` 購読は `cancelled` フラグ＋`attempt` インクリメントで
  再購読する設計（`useCurrentLocation` と同じ規律）。pause 中は `useRef` ミラーで最新値を読み、
  effect を貼り直さない工夫がある（GPS 再購読コストを避ける）。
- ルート取得失敗・位置情報取得失敗の3状態（Loading/Empty/Error）は `ExploreErrorCode` /
  `walkRouteErrorMessage` / `isRetriableExploreError` を散歩開始・散歩中の両画面で共通利用しており、
  画面ごとに独自のエラー分類を作っていない。

**既知の残課題（すべて Suggestion 相当、対応不要・記録のみ）:**
- `useActiveWalk` の戻り値に軌跡 `points`（`GeoCoordinates[]`）がまだ露出していない。
  `useWalkTracking` は `points` を返すが `UseActiveWalkResult` には含まれず、`WalkActiveView` の
  終了時 params にも渡されない。M5（散歩記録の保存）着手時に `useActiveWalk` の型・戻り値を拡張する
  必要がある。プラン（§3.3-4）の「渡せる状態になっている」という記述はやや先取りしすぎだった。
- `WalkStartView.handleStartWalk` が `WalkDestination` を手動で再構築しており、`useWalkPlan` 内部の
  同型 `useMemo`（外部非公開）と実質重複している。`useWalkPlan` から `destination` を公開すれば解消できる。
- `SpotMapView` と `WalkRouteMapView` のルート追従カメラ（`animateToRegion` の `useEffect`）が
  ほぼ同一の形で2箇所に重複している。`WalkRoutePolyline` は共通化済みだがカメラ制御は未共通化。
- 散歩中画面ヘッダーの「往復の目安」（`ActiveWalk.roundTripMinutes`＝探索結果のスナップショット）と、
  `WalkRouteSummary`/ヘッダー直下の「片道」表示（`walkRoute.durationSeconds` ベース）が異なる数値
  ソースに基づくため、値が近いが一致しないケースがありうる（プランが明示的に「目安」の語で吸収する
  設計を選んでおり、アーキテクチャ上の問題ではなくUXの微調整余地）。
