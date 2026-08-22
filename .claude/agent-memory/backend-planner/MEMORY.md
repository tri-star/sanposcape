# backend-planner memory index

- [認証アーキテクチャ (ADR-002) と M3 の分担](project_auth_architecture_ss10.md) — Google 直結 + 自前セッショントークン。SS-10/SS-12 の線引き
- [確定済み設計の扱いと API 命名規約](feedback_settled_design_and_api_conventions.md) — 確定 ADR は再検討しない / フィールド名は snake_case 統一
- [M5「散歩記録・履歴」の分担と ADR-003 追補運用](project_m5_walk_history.md) — SS-18〜21 の順序 / walks の設計は ADR-003 に一本化し追補し続ける（残タスクもそこに載る）
- [mobile プランからの API 要求の受け方とスパイク先行](feedback_plan_handoff_between_mobile_and_backend.md) — 要求へ1項目ずつ回答 / 実 API 依存はステップ0で実測
- [SS-33 周回ルートの確定方式](project_ss33_loop_route.md) — 案A(経由点自動生成)+スパイク先行。mobile 同時リリース前提で破壊的変更を許容（ADR-001 追補後に削除）
