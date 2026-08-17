# mobile-planner メモリ索引

- [mobile 構造の要点](mobile-structure.md) — packages/mobile の確定した規約・既存資産・落とし穴
- [認証アーキテクチャ](auth-architecture.md) — ADR-002 の確定事項／認証ゲートの隠れた結合（ゲスト可否は1関数では変えられない）
- [デザインシステムの SSoT](project_design_system_ssot.md) — トークン値は Claude Design、実装はリポジトリ。同期は一方向
- [MCP と CI の制約](project_codegen_ci_constraint.md) — MCP は CI から呼べない。codegen は fetch/transform を分離する
- [テストの構造的制約](project_test_and_styling_constraints.md) — RN の render テストは書けない。純粋関数に切り出す
- [mock と prop 名の食い違い](reference_mock_and_prop_divergence.md) — 画面一次資料の場所／mockのonClick等をRN props(onPress)に読み替える
- [MVP画面とスタブ層](project_screens_and_stub_layer.md) — SS-8の画面一覧／data層の置き場と型制約／表示確認手段／msw不整合
- [探索APIの制約](project_explore_api_constraints.md) — /explore/places の契約・コスト・呼び出し抑制ルール（M4）
- [計画入力](reference-planning-inputs.md) — SS 課題、Module/ADR/設計資料、プラン出力先
- [探索 API 契約の非対称性](project-explore-api-contract.md) — places は往復、walking route は片道の値
- [E2E / CI 制約](project-e2e-ci-constraints.md) — Maestro の実行モデル・503の継ぎ目・assert してはいけないもの
- [モバイルテストの実態](feedback-mobile-testing-reality.md) — MSW 利用と純粋関数テストの方針
- [RN 実行時にないもの](project-rn-runtime-capabilities.md) — crypto/永続ストレージ不在と依存追加のコスト
- [散歩ドメインの契約](project-walk-domain-contract.md) — walks API と mobile 側の値の対応・冪等キーの採番位置
- [ナビゲーションの実態](project-navigation-model.md) — replace 連鎖で canGoBack=false／Android バックの前提／開始前に副作用が無い根拠
