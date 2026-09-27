---
name: project_ss118_pin_map_display
description: SS-118(登録済みピンの地図表示・詳細画面)mobileアーキレビュー結果。render slot合成は模範実装。useQueriesの戻り配列の参照不安定→combineにモジュールレベル関数を渡して解消(ADR-012 D15)
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-012-pin-map-display-and-detail.md
  source_issue: SS-118
---

SS-118（登録済みピンの地図表示 + ピン詳細画面。ユーザー追加要件でマーカータップは直接詳細へ push）の
mobile 実装をアーキテクチャレビュー（2026-09-26）。プラン・ADR-012 と実装がほぼ完全に一致。Critical 指摘なし。

**Why:** 他レビューでも再利用価値が高い設計判断・発見した実装バグ。

1. **`features/walk` ⇔ `features/pin` の render slot 合成パターンの模範実装**
   （`WalkActiveView.renderMapLayers(visibleRegion)` を `app/(tabs)/index.tsx` が
   `RegisteredPinsMapLayer` で埋める）。`WalkRouteMapView`/`PinMapFullScreen` はどちらも
   `mapLayers?: ReactNode` を `MapView` の子としてそのまま描くだけで中身を知らない。
   `docs/folder-structure.md`「feature をまたいで地図に要素を重ねたい」節に実例として
   文書化済み。次に feature 間で地図合成が必要になったら同じ形を踏襲できる。

2. **`useQueries`（TanStack Query v5.102）の戻り値配列は、データが不変でも毎レンダー新しい
   参照になる**（`node_modules/@tanstack/query-core/build/modern/queriesObserver.js` の
   `getOptimisticResult`/`#combineResult`/`#trackResult` はいずれも `matches.map(...)` で
   都度新しい配列を作る。`combine` オプション未指定なら構造共有は効かない）。
   `useRegisteredPins.ts` の `const merged = useMemo(() => mergeRegisteredPinPages(...), [queries])`
   はこの性質を見落としており、`queries` が毎レンダー別参照になるため **`merged`（= `pins`）は
   データ不変でも毎レンダー再計算され、新しい配列参照になる**。同じファイル内の `retry`
   コールバックのコメント（「`queries` は毎レンダー新しい配列になるため依存配列に含めない」）が
   まさにこの性質を認識しているにもかかわらず、`merged` の useMemo には適用されていない
   （実装時の見落としと推測）。
   - 影響: `RegisteredPinMarkers`（`React.memo` でラップ）の `pins` prop が毎レンダー新しい
     配列参照になるため、`React.memo` の意図（`WalkActiveView` が経過時間で毎秒再レンダーされる
     間もマーカーを再描画しない。`mobile-plan.md` 5.8 節の明記事項）が実質的に無効化される。
     `tracksViewChanges={false}` のため実害は「JSX 生成コストの繰り返し」程度に留まり、
     視覚的なちらつきや機能的なバグには直結しないと見られるが、意図した最適化が効いていない。
   - **同PR内で解消済み**: `useQueries({ queries, combine })` の `combine` にモジュールレベルの
     純粋関数（`pinRead.ts` の `combineRegisteredPinListQueries`）を渡す形に直した。`combine` の
     関数参照が不変なら TanStack Query は再計算を省き、`replaceEqualDeep` で構造共有するため
     `pins` の参照が保たれる。再試行も `combine` の戻り値 `refetchAll` から呼ぶ（mobile ADR-012 D15）。
   - 次に `useQueries` の利用箇所を見たら、派生値を `useMemo([queries])` で作っていないか確認し、
     `combine`（インラインクロージャではなく安定した関数参照）への置き換えを提案する。
     単純な `[queries]` 依存はほぼ常に「毎レンダー再計算」と同義になる。

3. **`usePinDetail.ts` の `resolvePinDetailPhotos` の useMemo（依存 `[detailQuery.data,
   photosQuery.data]`）は正しく安定する**（`useQuery`/`useInfiniteQuery` 単体の `.data` は
   TanStack Query の構造的共有で不変時に同一参照になるため）。#2 の問題は `useQueries`
   （複数クエリを配列で返す API）に固有。

4. **`isAllowedUploadUrl` の多目的化（アップロード許可判定 → 閲覧 presigned GET の許可判定にも
   流用）は関数名を変えずに JSDoc だけ追記する設計**（`presignedPostForm.ts`）。ADR-010 決定8の
   延長として妥当。次に同じ関数を3つ目の用途に使うことになったら、関数名の一般化
   （例: `isAllowedStorageUrl`）を検討する潮時。

5. **`dateLabel.ts` 昇格（`features/history/lib/walkDateLabel.ts` → `src/lib/dateLabel.ts`）は
   2機能ルールの正しい適用**。旧ファイル・旧テストは削除され、import 元3ファイルも
   置き換え済み（残骸なし）。

**How to apply**: 次に `features/pin` や地図系の render slot 合成を見たら1を踏襲されているか
確認する。`useQueries` を使う新規 hook を見たら2の観点（派生値の useMemo 依存が `queries` 配列そのものに
なっていないか。`combine` に安定した関数参照を渡しているか）を必ず確認する。

**関連メモリ**: [[project_ss124_pin_location_picking]]（`PinMapFullScreen` の共通化・
`Modal` 回避オーバーレイパターンの先例）、[[project_ss88_pin_registration_mobile]]
（`features/pin` の認証非依存規約・oxlintrc override）。
