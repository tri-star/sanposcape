---
name: project_ss21_e2e_finish
description: SS-21 MVP E2E(Maestro)仕上げの実装内容・良好パターン・確認事項（testID注入・subflow設計・tag運用）
type: project
---

SS-21（`feat/ss-21-mvp-e2e`）は MVP 主要フロー（認証→探索→散歩開始→終了・保存→履歴一覧/詳細）を
`.maestro/mvp-walk-flow.yaml` として1本にまとめ、共通手順を `subflows/`（`sign-in.yaml` /
`start-walk-from-spot.yaml`）に切り出した。tag（`smoke`/`mvp`/`maps-required`）で
CI 実行対象を制御。backend の fake Maps provider（`MAPS_MODE=fake`）は SS-44 に分離済みで、
それまでは `mvp-walk-flow.yaml` を `--exclude-tags=maps-required` で CI から除外する設計。

**良好パターン（再利用可）**:
- 共有プリミティブ（`TabBar`）への testID 注入は `itemTestIDPrefix?: string` を追加し、
  未指定時は `testID=undefined`（既存呼び出し元 `DesignSystemGallery` は無指定のまま影響なし）。
  固定 testID を埋め込まず呼び出し側から注入する設計は横展開してよい。
- 状態判別 testID は「root は据え置き、状態でしか描画されない内側要素に `${testID}-<state>` を足す」
  方針を `WalkRouteSummary`（ready）/`WalkSaveStatus`（saving/saved）で一貫して実装。既存 testID は
  リネームしていない。
- disabled ボタンを Maestro がタップ成功扱いする問題への対策（ready 状態 testID を先に待つ）や、
  履歴の件数・空状態を E2E で assert しない方針（同一 CI ラン内で他フローの記録が残るため）は
  ADR-004 追補・`architecture-guideline.md` に明記され实装と一致。

**確認された設計上の前提（コードで裏取り済み）**:
- `WalkSummaryView` の「記録を見る」は `savedWalkId !== null` なら
  `router.replace("/walk-history/[walkId]")`。遷移前のスタックは `[(tabs), walk-summary]` なので
  replace 後は `[(tabs), walk-detail]` となり、`walk-detail-back` で `canGoBack()===true` →
  `router.back()` で `(tabs)` の index タブ（`WalkActiveView`）に戻る。`finishWalk()` が
  `useActiveWalkStore.endWalk()` で `activeWalk` を null にするため idle 表示
  （`walk-active-idle`）になる。`mvp-walk-flow.yaml` の「戻る→タブ→最近の散歩」ステップの前提は
  正しい。
- `useWalkPlan.canStartWalk = selectedSpot !== null && route.walkRoute !== null` であり、
  `WalkRouteSummary` の `-ready` testID 付与条件（`walkRoute !== null`）と一致。disabled ボタン対策
  として整合している。

**残課題（レビュー時点で未解決・要フォロー）**:
- `docs/milestones.md:155-164` に「`mvp-walk-flow.yaml` の実機/エミュレータでの通し実行はまだ
  未確認」と明記されている。yaml 構文と testID 参照の静的な整合は確認済みだが、実行時の
  flake（`waitForAnimationToEnd` での軌跡蓄積、`canGoBack()` の実機挙動等）は未検証のまま。
  マージ前にローカル実行での確認を推奨。
- backend 側 `MAPS_MODE=fake`（SS-44）が入るまで `mvp-walk-flow.yaml` は CI で一度も実行されない
  （タグで恒久的に除外）。CI 上で緑になったことは「smoke 系4フローが緑」の意味でしかない。
