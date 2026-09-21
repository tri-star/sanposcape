---
name: project-ss88-pin-naming-and-photo-limits
description: SS-88 のユーザー決定。地図上の登録地点は「ピン(Pin)」、「スポット」はゴール候補(SpotCandidate)に限定。写真は枚数無制限・1枚10MiB・合計1GiB・サムネイル必須
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
  verify_by: 2026-12-31
---

SS-88（地図にピンを登録）でユーザーが決めた、プランの前提を覆す事項。mobile の初期プランは「Spot」「5枚・5MiB・200MiB」で書かれていたが、すべて破棄された。

- **命名**: 地図上に自由に登録する地点は全レイヤーで `Pin`（`pins` / `pin_photos` / `pin_tags` / `/pins` / `client_pin_id` / フラグ `pin_registration`）。地図は `SanpoMap`（`maps/` ドメインは探索・経路なので `Map` 単体は使わない）。**「スポット」は散歩のゴール候補（`SpotCandidate`）の意味に限定**。サンプルの `spots/` ドメインは削除方針。
- **写真**: ピンあたりの枚数は無制限、1枚 10 MiB、ユーザー合計 1 GiB（アップロード者計上）、いずれも設定値。端末での縮小（長辺2048px・EXIF除去）は維持。サムネイルはアップロード（確定）時に作る。
- infra（SS-106/107）はバケット・SSM も pin 系に揃える予定（`sanposcape-<env>-pin-photos-<account_id>`、`/sanposcape/<env>/platform/pin_photos/*`）。境界の S3 アクションは Put/Get/Delete/AbortMultipartUpload + ListBucket のみ。

**Why:** 「スポット」が既存のゴール候補と語義衝突するため。枚数無制限は共同編集で写真が増える前提。
**How to apply:** SS-88 の後続（閲覧・編集・招待・容量表示など）のプランでは Pin 命名と上記上限を前提にする。無制限でも1リクエストの処理枚数は Lambda 29 秒予算で上限を設ける（SS-88 では10枚＋写真追加 API）。決定は ADR-009（SS-88 で新設予定）に昇格させ、ADR ができたらこのメモは `adr` を付けて durable にするか削除する。

関連: [[feedback-template-ssm-resolve-blocks-deploy]] / [[feedback-settled-design-and-api-conventions]]
