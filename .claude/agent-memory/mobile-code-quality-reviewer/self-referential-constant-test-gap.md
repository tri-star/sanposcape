---
name: self-referential-constant-test-gap
description: ハードコードした暗号定数（既知のハッシュ値など）を検証するテストが、実装が参照する同じ定数と比較するだけの自己参照になっていないか確認する
metadata:
  type: feedback
  scope: durable
---

SS-70（CloudFront x-amz-content-sha256 対応）のレビューで発見。

`packages/mobile/src/api/contentHash.ts` の `EMPTY_BODY_SHA256`（空文字列の SHA-256 の
ハードコード定数）を検証するテストが、`contentHash.test.ts` 内で

```ts
expect(headers.get(CONTENT_SHA256_HEADER)).toBe(EMPTY_BODY_SHA256);
```

のように「実装が使うのと同じ定数」と比較するだけになっており、定数値そのものが正しい
SHA-256(empty string) かどうかを独立に検証していなかった（自己参照的なテストで、
定数に typo があってもテストは通ってしまう）。

**Why:** 空文字列の SHA-256 (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)
は環境非依存の既知の値であり、`createHash("sha256").update("").digest("hex")` で
テスト側からも独立に計算できる。にもかかわらず独立計算と比較していないと、
DELETE 系エンドポイントが本番(CloudFront経由)で全部 403 になる不具合を単体テストが
検出できない。

**How to apply:** ハードコードされた既知のハッシュ/定数値を実装が参照している箇所を見たら、
テストが「実装内の定数と一致する」ことだけでなく「定数の値そのものが正しい」ことを
独立した計算（同じ定数を import せず、別ルートで計算した値と比較）で検証しているか確認する。
関連: [[testing-constraints]]
