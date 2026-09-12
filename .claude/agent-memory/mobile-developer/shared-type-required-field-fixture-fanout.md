---
name: shared-type-required-field-fixture-fanout
description: 共有ドメイン型（WalkRoute等）に必須フィールドを追加すると、計画書が挙げていないテストファイルのリテラルフィクスチャも型エラーになる。grepで全構築箇所を洗い出す。
metadata:
  type: feedback
  scope: durable
---

共有ドメイン型（`features/<feature>/types.ts` に定義される型で複数ファイルから import されるもの、
例: `WalkRoute`）に**必須**フィールドを追加すると、その型のオブジェクトリテラルを直接組み立てている
すべてのテストファイルが型エラーになる。実装プラン（ユーザー作成のプランドキュメント含む）が
「このテストファイルは変更しない」と明記していても、それは通常「ロジック・アサーションを変えない」
という意図であり、型を満たすための機械的なフィールド追加まで禁じたものではない。

**How to apply**: 型に必須フィールドを追加する変更をする際は、着手前に
`grep -rln "<型のプロパティ名>:" src/**/*.test.ts` などでその型のリテラル構築箇所を横断的に洗い出す
（import 元だけでなく `describe`/`it` 内のフィクスチャ定義も対象）。実装プランの「変更しないテスト」
リストを鵜呑みにせず、`pnpm typecheck` を実行して機械的に洗い出すのが最も確実（実際に
`routeDeviation.test.ts` / `routeRecalculation.test.ts` はプランが「変更しない」としていたが、
`WalkRoute.legs` / `returnIsSamePath` の追加で型エラーになった。SS-33）。
修正は最小限（新フィールドに空配列や false などの中立値を足すだけ）にとどめ、
既存のアサーション・シナリオには手を入れない。
