---
name: oxfmt-individual-file-drift
description: 個別ファイルへの oxfmt 実行は package.json の format スクリプトと結果がずれることがある
metadata:
  type: feedback
---

`pnpm exec oxfmt <個別ファイルパス...>` を都度実行しても、最終的に
`pnpm --filter mobile format:check`（`oxfmt --check src app index.ts ...` という
package.json 定義の引数リスト）を通すと再度フォーマット崩れが検出されることがあった
（SS-19 で `src/lib/uuid.test.ts` の正規表現リテラル1行が、個別実行時は複数行に
折り返されたが、パッケージ全体コマンドでは1行にまとめられた）。

**Why:** 原因は未特定だが、引数として渡すパス集合（cwd 相対の複数ルート vs 単一ファイル）
によって適用される行幅・改行判定が微妙に変わるように見える。個別ファイル実行だけを
信用すると CI の `format:check` で失敗する。

**How to apply:** 実装の区切りごとに個別ファイルへ `oxfmt` を掛けるのは開発中の速さのために
問題ないが、**コミット前・タスク完了前には必ず `pnpm --filter mobile format:check`
（package.json のフルコマンド）を実行して green を確認する**こと。個別実行だけで
「フォーマット済み」と判断しない。
