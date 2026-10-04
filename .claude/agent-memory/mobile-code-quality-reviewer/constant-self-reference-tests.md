---
name: constant-self-reference-tests
description: 定数を検証するテストの自己参照を2種類に分けて扱う。ハッシュ等の既知定数を実装の同じ定数と比べるだけのテストは指摘する。*Copy.test.ts の非空文字列チェックは既存の慣習なので単発では指摘しない
metadata:
  type: feedback
  scope: durable
---

## 指摘すべきもの: 既知の定数値そのものを独立に検証していない

SS-70（CloudFront の x-amz-content-sha256 対応）で発見。`packages/mobile/src/api/contentHash.ts` の
`EMPTY_BODY_SHA256`（空文字列の SHA-256）を検証するテストが、実装と同じ定数を import して
`toBe(EMPTY_BODY_SHA256)` と比べるだけになっていた。これでは定数に typo があってもテストが通り、
本番で DELETE 系が全部 403 になる不具合を単体テストで検出できない。

**How to apply:** ハードコードした既知のハッシュや定数を実装が参照していたら、テストが
定数を import せず別ルートで計算した値と比べているか確認する
（例: `createHash("sha256").update("").digest("hex")`）。そうなっていなければ指摘する。

## 単発では指摘しないもの: *Copy.test.ts の非空文字列チェック

`features/*/lib/*Copy.test.ts`（`walkDeleteCopy.test.ts` が先例で、`accountDeleteCopy.test.ts` は
SS-62 でそれを踏襲）は、次の3種類のテストを持つ。

1. 手書きリテラルとの `toContain`（正当な内容検証）
2. 分岐ごとに文言が変わることの確認
3. `it.each` で全定数の `length > 0` を確認するだけの非空チェック

3つ目は低価値だが、既存の慣習の踏襲であり、上の暗号定数の自己参照とは深刻度が違う。

**How to apply:** 新しい `xxxCopy.test.ts` の非空チェックを単体で Warning にしない。指摘するなら
「文言テストは hardcode した比較文字列での `toContain`/`toBe` を優先する」という横断的な Suggestion に留める。
