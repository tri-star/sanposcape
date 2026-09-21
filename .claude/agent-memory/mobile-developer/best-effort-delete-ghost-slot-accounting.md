---
name: best-effort-delete-ghost-slot-accounting
description: best-effort な削除APIが失敗しても、ローカルの資源枠カウントをbackendの実際の占有とズレさせない「幽霊枠」パターン(SS-88 PR#93 T11)
metadata:
  type: reference
  scope: durable
---

## 問題

先行アップロードした写真を紐付け前に削除できる UI（`usePinPhotos.removePhoto`）があり、
削除は `DELETE /pin-photo-uploads/{id}` を **best-effort**（失敗しても致命的ではない）で呼ぶ。
ローカルの state（`PhotoDraftItem[]`）からは即座に消えるため、素朴に実装すると
「ローカルの未使用枠カウント（`heldUploadSlots`）」がすぐ減り、次の先行アップロードを
許可してしまう。しかし delete が失敗すると backend 側の枠は紐付け期限（6時間）まで
残るため、ローカルとbackendの会計がズレ、追加・削除を繰り返すと backend 側の
実際の枠上限（429/`photo_slots_busy`）にすぐ到達してしまう。

## パターン（「幽霊枠」カウンタ）

- state から削除された物理的な項目数とは別に、`heldGhostSlotsRef`（`useRef(0)`）で
  「delete が未確定・失敗した項目の個数」を持つ。
- 削除時: `heldGhostSlotsRef.current += 1` してから delete API を呼ぶ。
  - 成功: `heldGhostSlotsRef.current -= 1`（下限0）してキューを再駆動（`kick()`）。
  - 失敗: 何もしない＝幽霊枠のまま数え続ける（このフックのライフサイクル中は
    楽観的に解放しない＝安全側）。
- 上限判定を行う純粋関数（`nextPreuploadWork`）に `extraHeldSlots?: number`
  （省略時0）を追加し、`heldUploadSlots(state) + extraHeldSlots >= limit` で判定する。
  こうすることで判定ロジック自体は純粋関数のまま保て、ユニットテストで
  `extraHeldSlots` を直接指定して検証できる。

## テスト戦略

hooks はプロジェクト方針でユニットテスト対象外（[[test-scope-hooks-components]]）なので、
`removePhoto` 自体の削除呼び出しは直接テストできない。代わりに:

1. 上限判定の純粋関数（`nextPreuploadWork`）に `extraHeldSlots` のテストケースを追加する。
2. 隣接する lib のテスト（このケースでは `pinSaveRunner.test.ts` の模型サーバー）に
   `deleteUpload()` を実装し、「発行→即削除」を多数回繰り返しても模型サーバーの
   `pending` が正しく0に戻り、最終的な保存が枠上限エラーにならないことを固定する。
   これは実際の hook を経由しないが、「delete を呼べば会計が一致する」という
   設計上の主張を検証する代替手段になる。

## How to apply

同様の「ローカル state からは消えるが backend 側の資源解放は非同期・失敗しうる」
状況（アップロード枠・予約・ロック等）に遭遇したら、このパターン（幽霊枠カウンタ +
上限判定関数への加算パラメータ追加 + 模型サーバーでの回帰テスト）を再利用する。

参照実装: `packages/mobile/src/features/pin/hooks/usePinPhotos.ts`（`heldGhostSlotsRef`）、
`packages/mobile/src/features/pin/lib/photoDraft.ts`（`nextPreuploadWork` の `extraHeldSlots`）、
`packages/mobile/src/features/pin/lib/pinSaveRunner.test.ts`（`deleteUpload` を持つ模型サーバー）。
