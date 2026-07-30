# mobile-planner メモリ索引

- [mobile 構造の要点](mobile-structure.md) — packages/mobile の確定した規約・既存資産・落とし穴
- [認証アーキテクチャ](auth-architecture.md) — ADR-002 の確定事項と、認証プランで外せない構造上の制約
- [デザインシステムの SSoT](project_design_system_ssot.md) — トークン値は Claude Design、実装はリポジトリ。同期は一方向
- [MCP と CI の制約](project_codegen_ci_constraint.md) — MCP は CI から呼べない。codegen は fetch/transform を分離する
- [テストの構造的制約](project_test_and_styling_constraints.md) — RN の render テストは書けない。純粋関数に切り出す
- [mock と prop 名の食い違い](reference_mock_and_prop_divergence.md) — 画面一次資料の場所／mockのonClick等をRN props(onPress)に読み替える
- [MVP画面とスタブ層](project_screens_and_stub_layer.md) — SS-8の画面一覧／data層の置き場と型制約／表示確認手段／msw不整合
- [探索APIの制約](project_explore_api_constraints.md) — /explore/places の契約・コスト・呼び出し抑制ルール（M4）
