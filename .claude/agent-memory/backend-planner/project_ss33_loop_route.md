---
name: project-ss33-loop-route
description: SS-33（周回ルート）は 2026-08-22 に MVP 必須へ格上げ。方式は案A（経由点自動生成）+ スパイク先行でユーザー確定、mobile 同時リリース前提で /explore/routes/walking の破壊的変更を許容。
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33「往路と復路が異なる周回ルート」は **2026-08-22 に後続改善タスクから MVP 必須へ格上げ**された。
実現方式は **案A**（復路用の経由点を backend が幾何的に自動生成し、`computeRoutes` に
`intermediates=[目的地(stopover), 経由点(via:true)]` を与えて 1 リクエストで `legs=[往路, 復路]` を得る）で、
**スパイク（実 API を叩く捨てコード）を実装の最初のステップに置く**ことがユーザー判断で確定している。

**Why:** 案Aの品質は経由点生成ロジックに完全に依存し、机上では自然さを判定できない。
案B（代替ルート選択）は短距離徒歩で代替が返らないリスク、案C は API 6倍、案D は UX 仕様変更、
案E は ADR-001 の単一ベンダー決定を覆すため、いずれも MVP には不適と判断された。

**How to apply:** maps ドメイン / ルート提示に関わるプランを作るときは、
`docs/adr/ADR-001` の「往復“時間”範囲は片道×2」という記述が SS-33 で更新される前提で読むこと
（一覧 `/explore/places` は「片道×2×LOOP_FACTOR の目安」、`/explore/routes/walking` は「周回全体の実値」という
**意図的な非対称**が残る）。方式選定を蒸し返さない（[[feedback-settled-design-and-api-conventions]]）。
SS-33 完了時に ADR-001 へ追補される想定なので、**追補後はこのメモリを削除して ADR を正とすること**。

**mobile はストア配布前で backend と同時リリースできるため、`/explore/*` の破壊的変更が許容されている。**
この前提が崩れる（先行配布済みクライアントが存在する）と、エンドポイント新設に切り替える必要が出る。
API 契約の変更を検討するときは、まずこの前提がまだ生きているかを確認すること。

関連: [[feedback-plan-handoff-between-mobile-and-backend]]
