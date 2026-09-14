---
name: copy-constant-trivial-self-check-convention
description: walkDeleteCopy.test.ts / accountDeleteCopy.test.ts 等の「非空文字列チェック」は実装と同じ定数を再import して比較するだけの低価値テストだが、既存の意図的な反復パターンであり単発の指摘対象ではない
metadata:
  type: feedback
  scope: durable
---

`features/*/lib/*Copy.ts`（例: `history/lib/walkDeleteCopy.ts`、SS-62 の
`settings/lib/accountDeleteCopy.ts`）に付く `.test.ts` は、次の3種のテストを必ず持つ:

1. `toContain("元に戻せません")` のように、実装の定数を**別の手書きリテラル**と比較する
   （これは正当な内容検証。[[self-referential-constant-test-gap]] が問題にした
   「実装の定数をそのまま import して自分自身と比較する」ケースには該当しない）。
2. `accountDeleteConfirmLabel(true) !== accountDeleteConfirmLabel(false)` のような分岐確認。
3. `it.each` で全定数を回して `length > 0` を確認するだけの「非空文字列チェック」。

3番目は実装の定数をそのまま import して「空でないこと」を見るだけなので、typo や文言の質を
検出できない低価値なテストだが、`walkDeleteCopy.test.ts`（history, SS-60系）が先例であり
`accountDeleteCopy.test.ts`（SS-62）はそれをそのまま踏襲しただけ。

**Why:** レビュー依頼で「自己参照的テストになっていないか」を個別に問われた場合、
[[self-referential-constant-test-gap]]（ハッシュ値のような暗号定数の自己参照）と
混同して同じ深刻度で指摘しないよう区別する。こちらは「低価値だが実害の無い、既存の
反復されたテストスタイル」であり、新規に導入されたコードだけの問題ではない。

**How to apply:** 新しい `xxxCopy.test.ts` に「非空文字列チェック」の `it.each` ブロックが
あっても、それ単体を Warning にしない（既存の踏襲）。指摘するなら「このプロジェクト全体の
慣習として、文言テストは低価値な非空チェックより hardcode した比較文字列での `toContain` /
`toBe` を優先する方が良いのでは」という横断的な Suggestion に留める。
