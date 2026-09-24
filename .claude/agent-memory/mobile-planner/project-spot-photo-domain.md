---
name: project-spot-photo-domain
description: ピン登録(SS-88)の命名決定(新機能は Pin、スポットはゴール候補のみ、地図は SanpoMap)と、写真S3直送の前提（presigned POST・ACL禁止・同一origin http・1枚10MiB/合計1GiB・10枚/リクエスト）
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
  verify_by: 2027-03-31
---

SS-88 で決まった、コードからはまだ読めない前提（2026-09 時点。実装後はルート ADR-009 / mobile ADR-010 が正本になる予定）。

**命名（ユーザー決定）**: 地図上に登録する地点は**コード・API・UI すべて「ピン(Pin)」**（`features/pin`、`/pins`、`pin_registration`）。
**「スポット」は既存の散歩ゴール候補（`SpotCandidate`）の意味だけ**。入れ物は `SanpoMap`（`Map` 単体は react-native-maps と紛らわしい）。
**Why:** 初版プランで「コード Spot / UI ピン」と提案したらユーザーに上書きされた（スポットが2つの意味になり混乱するため）。
**How to apply:** 新しいドメイン語を作るときは、既存 UI・コードで同じ語が別の意味に使われていないかを先に確認し、衝突するなら全レイヤーで別の語に統一する案を第一候補にする。

**写真の前提**:
- 1ピンの写真枚数は無制限（ユーザーは「実用上の要件」と明言。上限に当たったらユーザーに操作を求める案は却下された）。1リクエストで紐付けられるのは10枚（Lambda 29秒予算）、backend の未使用枠は30まで（429）。
  → mobile は先行アップロードを20枚に抑え、残りは待機して保存時に「10枚揃える→紐付けて枠を空ける」を繰り返す。429 は「待機に戻す」合図。再開は紐付け済みの記録から（応答の upload_id で判定）。
  **How to apply:** サーバーの制約をユーザー操作で回避させる設計は、ユーザーが明示した要件と衝突するなら採らない。まずクライアント側で吸収できないかを考える。
- 1枚 10 MiB（正は枠発行応答の `max_byte_size`）、合計 1 GiB/人（アップロード者に計上）。端末で長辺2048px・JPEG再圧縮は維持。未使用枠は30個まで（429）。
- バケットは BucketOwnerEnforced + SSE-S3 + DenyInsecureTransport → `acl`/SSE ヘッダーを送らない、https 必須。CORS なし。S3 POST 成功は 204。
- backend の `STORAGE_MODE=fake` は `http://<backend と同じ host>/dev-storage/…` を返す → mobile は「backend が http のとき同じ origin の http だけ」許可。

**S3 直送は mobile の3つ目の HTTP 出口**。backend 向け2箇所（`customFetch` / `authApi`）の横断ヘッダーを**付けてはいけない**側（[[project-cloudfront-client-contract]]）。

Related: [[mobile-structure]], [[project-feature-flags]]
