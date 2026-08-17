---
name: project_ss20_walk_history_walkid_traversal
description: SS-20で指摘したwalkId未検証パストラバーサル(High)は解決済み。isUuid()で二重検証されている(SS-57時点で確認)
type: project
---

`packages/mobile/app/walk-history/[walkId].tsx` は Expo Router 動的ルート（`[param]` 形式）。
SS-20 時点では `walkId` の非空文字列チェックのみで `fetchWalkDetail(walkId)` →
`/walks/${walkId}` にエンコードなしで渡っており、ディープリンク経由の `../` 注入で
同一ホスト内の別エンドポイントへ被害者の Bearer トークンを付けて誤送信させ得る
（confused deputy / path traversal 相当）として High 指摘していた。

**現状（SS-57 時点で確認）**: 解決済み。二重に検証されている。
- `app/walk-history/[walkId].tsx`: `isUuid(walkId) ? walkId : null` を `WalkDetailView` に渡す。
- `src/features/history/api/walkHistoryApi.ts` の `fetchWalkDetail()`: `isUuid(walkId)` でなければ
  通信せず `ApiError(404)` を投げる（JSDoc に「多層防御」「呼び出し側でも同じ検証を行っている」と明記）。

**Why**: 修正がいつ入ったか（どの issue か）は今回未特定。`isUuid` は `@/lib/uuid` に切り出されている。

**How to apply**: 今後 `[param].tsx` 形式の動的ルートが追加されたら、この2層防御パターン
（route 側 + API fetcher 側の双方で形式検証）を踏襲しているか確認する。このメモリは
「walkId 検証は未実装」という誤った前提で将来の指摘をしないための記録。
関連: [[project_ss57_guest_walk_start]]（SS-57 でこのルートにゲストも到達可能になった。
ゲストは Authorization ヘッダを送らないため confused-deputy の実害はゲスト自身には無いが、
検証自体は authenticated 経路のために必要で維持されている）。
