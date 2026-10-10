# backend-planner memory index

- [確定済み設計の扱いと API 命名規約](feedback-settled-design-and-api-conventions.md) — 確定 ADR は再検討しない / snake_case 統一 / 開発専用エンドポイントは OpenAPI に載せない / PR 分割は既定だが同一 PR 指示があれば従う
- [着手前に既存の仕込みと並行チケットを確認](feedback-check-existing-and-parallel-work-before-planning.md) — 「追加する」でも先行タスクの受け口が無いか見る / 共通部品・ADR 決定番号・Alembic head が並行チケットと衝突（SS-113/112, SS-173/171）
- [CloudFront OAC は Authorization を上書きする](feedback_cloudfront_oac_authorization_header.md) — Lambda Function URL 構成では認証ヘッダー名の設計を必ず立てる。/health では露見しない
- [AWS AppConfig フィーチャーフラグ 4 つの罠](feedback_appconfig_feature_flag_gotchas.md) — OFF フラグの属性は配信されない / トークン1回限り24h / 空ボディ / IAM は appconfig 名前空間
- [infra 未 apply の SSM resolve は deploy を止める](feedback-template-ssm-resolve-blocks-deploy.md) — アプリは Unconfigured で先行、template 結線は infra apply 後の別チケット
- [締め切りは実行中の呼び出し1回分も予算に入れる](feedback_deadline_must_budget_inflight_call.md) — 呼ぶ前だけ確認は不十分。試行回数×timeout を見積もり「締め切り+最悪1回<29秒」を示す
- [CI ではテスト用 DB を alembic 後の DB と共有](feedback-ci-test-db-shared-with-alembic.md) — テスト DB の初期化を変えるプランは ADR-B-001 を読む。開始時に drop_all→create_all、対象は metadata のテーブルだけ
- [openapi.yaml 変更は mobile CI を起動する](feedback-openapi-change-triggers-mobile-ci.md) — クエリ無し GET へのクエリ追加で Orval の引数が変わる / required 追加でフィクスチャが落ちる
- [ファイル移動リファクタの落とし穴](feedback-backend-file-relocation-gotchas.md) — docstring=OpenAPI description / ロガー名・parents[N]・lock namespace 文字列 / __pycache__ / staleness は末尾一致
- [既存テーブルへの列追加とデプロイの空白](feedback-existing-table-column-add-deploy-window.md) — migrate は deploy 後にしか流せず、その間そのテーブルを読む API が 500。prod 稼働後はマイグレーション単独 PR
- [アップロード枠の行は写真より長生きする](feedback-upload-slot-rows-outlive-photos.md) — attached 枠は写真削除後もアカウント削除まで残る。枠に載せた写真ごとの個人データは紐付け時に写して消す（SS-163）
- [親の付け替え × キー収集→CASCADE 削除の競合](feedback-reparent-vs-collect-then-cascade-delete.md) — FK 付け替えを足すと削除側が生き残った子の S3 実体を消す。収集前に子を FOR UPDATE、新親は KEY SHARE
- [Lambda アダプタ境界で崩れる前提](feedback_lambda_adapter_boundary_assumptions.md) — Mangum auto は呼び出しごと lifespan / CloudFront 経由の sourceIp は CF の IP。TestClient では検出不可
- [CloudWatch 可観測性クエリの罠](feedback-cloudwatch-observability-query-gotchas.md) — 名前空間は ApplicationSignals・Operation=FunctionHandler で絞る / 子スパン二重カウント / Insights に if 無し / log ウィジェットは開くたび課金
- [ログの JSON 化・例外ログの罠](feedback-structured-logging-lambda-otel-gotchas.md) — Lambda の LogFormat JSON は例外メッセージを必ず出す / OTel の例外記録はユーザーのミドルウェアより外 / 同期の依存の ContextVar.set は戻らない
- [infra 側の監視置き場と IAM 3 系統](reference-infra-monitoring-and-iam-layers.md) — アラート SNS の SSM 契約 / CloudFront アラームは services 層 / sam-deploy の CloudWatch は backend-* のダッシュボード・アラームのみ / app-boundary 残り約290字
