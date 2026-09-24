---
name: project_ss16_walk_route
description: SS-16（候補スポット選択→徒歩ルート提示→散歩開始・散歩中トラッキング）レビュー時点の実装状況と確認済みの設計整合ポイント。SS-33 で一部前提が更新されている
metadata:
  type: project
  scope: task-local
  source_issue: SS-16
---

計画（候補スポット選択→徒歩ルート提示→散歩開始・散歩中トラッキングの詳細設計）に基づき、
`services/location` への `watchPosition` 追加、`features/walk/{api,hooks,lib,store,components}` の
新規・拡張一式（`useWalkRoute` / `useWalkTracking` / `useActiveWalk` / `useActiveWalkStore` 等）が
実装済み（2026-08-01時点でレビュー、ブランチ `feat/ss-16-walk-route`）。

**環境上の注意（今後のレビューでも起こりうる）:**
- このレビュー時、gitStatus のスナップショットは `main` ブランチだったが、実際のワーキングツリーには
  SS-16 の全ファイルが存在していた（ブランチ切り替え後にスナップショットが更新されていなかった模様）。
  Bash ツールが使えない環境だったため `git diff` は実行できず、`docs/*` のファイルツリー記述とプランの
  「§4 作成・編集・削除するファイルのツリー」を突き合わせて対象ファイルを特定し、Read/Grep で直接検証した。
  同様の制約下では、プランの§4相当のファイルリストを頼りに実ファイルを1つずつ読むアプローチが有効。

**確認できた良好パターン（今後のレビューでも踏襲を期待してよい）:**
- サーバー状態（`WalkRoute` 本体）= TanStack Query、進行中の散歩の識別情報（`ActiveWalk`）= Zustand
  という `packages/mobile/docs/folder-structure.md` の使い分けが実コードで徹底されている。`useActiveWalkStore` は
  `origin`/`destination`/`roundTripMinutes`/`roundTripKm`/`startedAtMs` のみを持ち、ルート本体を
  複製しない（**SS-33 追補**: `roundTripMinutes`/`roundTripKm` は `loopMinutes`/`loopKm` へ rename 済み。
  値の出所が「往復の近似」→「周回ルートの実値」に変わったため）。
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
  ほぼ同一の形で2箇所に重複している。`WalkRoutePolyline` は共通化済みだがカメラ制御は未共通化
  （**SS-33 追補**: `WalkRoutePolyline` はその後 `src/components/ui/route-polyline/RoutePolyline.tsx`
  へ昇格し、往路/復路の描き分けは `features/walk/components/WalkRoutePolylines.tsx`（複数形）が担う
  構造に変わった。カメラ制御の重複自体は SS-33 でも未解消のまま）。
- 散歩中画面ヘッダーの「往復の目安」（`ActiveWalk.roundTripMinutes`＝探索結果のスナップショット）と、
  `WalkRouteSummary`/ヘッダー直下の「片道」表示（`walkRoute.durationSeconds` ベース）が異なる数値
  ソースに基づくため、値が近いが一致しないケースがありうる（プランが明示的に「目安」の語で吸収する
  設計を選んでおり、アーキテクチャ上の問題ではなくUXの微調整余地）。
  **SS-33 追補**: この指摘自体の前提が変わった。`ActiveWalk.roundTripMinutes` は `loopMinutes`
  （周回ルートの実値）へ rename され、「片道」表示は撤去された（`WalkRoute` が片道 `path` を持たなくなり
  `legs`〔往路/復路〕になったため）。候補一覧（`SpotCard`の往復値、`/explore/places`由来の片道×2近似）と
  選択後の `loopMinutes`（周回実値）が異なる数値ソースになる、という形でズレの構造自体は残っている
  （ユーザー確認済みの設計判断。ADR-008 決定1・決定2の「SS-33 追補」を参照）。
