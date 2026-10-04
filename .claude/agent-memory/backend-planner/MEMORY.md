# backend-planner memory index

- [確定済み設計の扱いと API 命名規約](feedback-settled-design-and-api-conventions.md) — 確定 ADR は再検討しない / snake_case 統一 / 開発専用エンドポイントは OpenAPI に載せない / PR 分割は既定だが同一 PR 指示があれば従う
- [着手前に既存の仕込みと並行チケットを確認](feedback-check-existing-and-parallel-work-before-planning.md) — 「追加する」でも先行タスクの受け口が無いか見る / 同じ ADR の BK 並行実装で共通部品・決定番号が衝突した（SS-113/SS-112）
- [CloudFront OAC は Authorization を上書きする](feedback_cloudfront_oac_authorization_header.md) — Lambda Function URL 構成では認証ヘッダー名の設計を必ず立てる。/health では露見しない
- [AWS AppConfig フィーチャーフラグ 4 つの罠](feedback_appconfig_feature_flag_gotchas.md) — OFF フラグの属性は配信されない / トークン1回限り24h / 空ボディ / IAM は appconfig 名前空間
- [infra 未 apply の SSM resolve は deploy を止める](feedback-template-ssm-resolve-blocks-deploy.md) — アプリは Unconfigured で先行、template 結線は infra apply 後の別チケット
- [締め切りは実行中の呼び出し1回分も予算に入れる](feedback_deadline_must_budget_inflight_call.md) — 呼ぶ前だけ確認は不十分。試行回数×timeout を見積もり「締め切り+最悪1回<29秒」を示す
- [CI ではテスト用 DB を alembic 後の DB と共有](feedback-ci-test-db-shared-with-alembic.md) — テスト DB の初期化を変えるプランは ADR-B-001 を読む。開始時に drop_all→create_all、対象は metadata のテーブルだけ
- [openapi.yaml 変更は mobile CI を起動する](feedback-openapi-change-triggers-mobile-ci.md) — クエリ無し GET へのクエリ追加で Orval の引数が変わる / required 追加でフィクスチャが落ちる
- [ファイル移動リファクタの落とし穴](feedback-backend-file-relocation-gotchas.md) — docstring=OpenAPI description / ロガー名・parents[N]・lock namespace 文字列 / __pycache__ / staleness は末尾一致
- [Lambda アダプタ境界で崩れる前提](feedback_lambda_adapter_boundary_assumptions.md) — Mangum auto は呼び出しごと lifespan / CloudFront 経由の sourceIp は CF の IP。TestClient では検出不可
