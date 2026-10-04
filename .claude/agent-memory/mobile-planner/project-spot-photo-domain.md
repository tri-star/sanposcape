---
name: project-spot-photo-domain
description: ピン/地図/写真まわりの前提はADRが正本（命名 Pin・SanpoMap・スポットはゴール候補のみ、S3直送の制約、閲覧URLの早期失効、GET /sanpo-maps/{id}は無い、PinReadにroleは無い）。どこに書いてあるかの索引と、計画で効いた教訓
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
  verify_by: 2027-03-31
---

SS-88 以降（SS-118 / SS-119 / SS-121 / SS-124）の計画で確認した前提。内容はすべて ADR に転記済みなので、ここは索引と教訓だけ残す。

## どこに書いてあるか

| 前提 | 正本 |
|---|---|
| 用語はピン（Pin）/ 地図（SanpoMap）/ スポット（`SpotCandidate` に限定） | `docs/adr/ADR-009-...` 決定1 |
| `PinRead` に role は無い。role は `GET /sanpo-maps` の `SanpoMapRead.role` から引く | ADR-009 決定24 |
| role 不明時はメンバーの最小権限 editor とみなす・PATCH は差分だけ送る | `packages/mobile/adr/ADR-M-017-pin-edit-and-delete.md` |
| 写真の S3 直送（presigned POST・ACL/SSE ヘッダーを送らない・先行アップロード20枚・10枚ずつ紐付け・未使用枠30で429） | `packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md` |
| S3 直送は3つ目の HTTP 出口で、backend 向けの横断ヘッダーを付けない | ADR-M-010（[[project-cloudfront-client-contract]]） |
| `client_pin_id` の冪等な再送は内容を無視して既存ピンを返す → 作成後は位置調整を無効化 | `packages/mobile/adr/ADR-M-011-pin-location-picking-and-adjustment.md` D9 |
| 閲覧 presigned GET は `urls_expire_at` より前に失効しうる → 読み込み失敗を契機に取り直す・`cacheKey` は `photo.id` ベース | `packages/mobile/adr/ADR-M-012-pin-map-display-and-detail.md` D7 |
| `GET /sanpo-maps/{id}` は無い（一覧キャッシュから引く）・`GET /pins` の `q` は名前・メモ・タグの OR 部分一致 | `packages/mobile/adr/ADR-M-014-sanpo-map-list-and-detail.md` |

計画時の補足: チケットの「地図一覧」は `SanpoMap`（ピンの入れ物）の一覧（`/sanpo-maps`）のこと。既存ピンへの写真追加は
`runPinSave` をそのまま使える（`getSavedPinId` が非 null なら `createPin` を飛ばして `addPinPhotos` だけ回す）。

## 教訓

- **新しいドメイン語を作るときは、既存 UI・コードで同じ語が別の意味に使われていないかを先に確認する**。衝突するなら
  全レイヤーで別の語に統一する案を第一候補にする（初版プランの「コード Spot / UI ピン」はユーザーに上書きされた）。
- **地図から隠す状態（アーカイブ等）を足すときは、(1) 除外は `GET /pins` のサーバー側で行う（端末で捨てると
  地図ごと1リクエスト200件の上限を隠れたピンが食う。ADR-M-012 D3）、(2) 隠したピンへ戻る導線（地図詳細のピン一覧）からは
  除外しない（解除できなくなる）**。SS-173 で採った形。
- **`PinRead` / `PinListItemRead` に必須フィールドを足すと、型付きフィクスチャを持つテスト（`pinReadApi` / `pinEditApi` /
  `pinApi` / `pinRead` / `pinEditDraft` / `pinEditSync` / `pinEditSaveRunner`）が typecheck で壊れる**。プランの変更ファイルに含める。
- **サーバーの制約をユーザー操作で回避させる設計は、ユーザーが明示した要件と衝突するなら採らない**。まずクライアント側で
  吸収できないかを考える（写真枚数の上限をユーザーに意識させる案は却下され、先行アップロード + 分割紐付けになった）。

Related: [[mobile-structure]], [[project-feature-flags]]
