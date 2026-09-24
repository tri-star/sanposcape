---
name: project-ss33-loop-route-pitfalls
description: SS-33 周回ルート(再チャレンジ)の前提と落とし穴。前回PR#62の指標の冗長性、fake 200m候補がE2Eの生命線
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-007-loop-route-generation.md
---

SS-33 は PR #62(origin/tri-star/SS-33)を2026-09-14にクローズしてからの再チャレンジ。ユーザー指示で「散歩中の再計算なし・折り返し到着判定なし」になり、ルートAPIはスポット選択時の1回だけ。新エンドポイント `/explore/routes/loop` を足し、`/explore/routes/walking` は配布済みビルドのために残す方針(2026-09-15 のプラン時点)。

**Why:** 前回の複雑さの大半は再計算と往路/復路判定の整合から来ていた。「動作確認でうまく行かない点」の中身は記録されていない。

**How to apply:**
- 前回の妥当性判定「総時間/(往路×2) ≤1.4」と「復路/往路 ≤1.8」は数学的に同値。旧ブランチの判定ロジックを流用するときは、指標が本当に独立しているか確かめる。Jaccard 重複率は長い復路で薄まり、ひげ(行き止まりへの往復)も検出できない。
- mobile E2E の subflow は `spot-card-0` = fake の最短候補(origin から約200m)を選ぶ。周回の判定しきい値を変えたら、fake の短距離でも周回が合格するかを必ず確認する。
- 周回の決定事項は ADR-007（`docs/adr/ADR-007-loop-route-generation.md`）と ADR-001 追補にある。この memory は落とし穴だけを残す。

関連: [[feedback-settled-design-and-api-conventions]] / [[feedback-cloudfront-oac-authorization-header]]
