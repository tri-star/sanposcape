---
name: project_ss98_appconfig_feature_flags_complete
description: SS-98 backend(AWS AppConfig取得層・評価層・GET /app-configエンドポイント)は実装完了。dev実デプロイでの動作確認はオーケストレータ判断により未実施
metadata:
  type: project
  scope: task-local
  source_issue: SS-98
---

SS-98（backend: AppConfig からフィーチャーフラグを読む基盤と `/app-config` エンドポイントの
追加）は実装完了（2026-09-20）。

- 実装場所: `integrations/aws/appconfig.py`（boto3 appconfigdata の取得層。トークン管理・
  ポーリング間隔・フェイルセーフ）、`core/feature_flags.py`（評価層。登録簿 `FEATURE_FLAGS`）、
  `app_config/`（`GET /app-config` の router/schemas/dependencies）。`config.py` に
  `FEATURE_FLAG_MODE`(real|stub) と `APPCONFIG_*` を追加。`main.py` の `_lifespan` で
  `app.state.feature_flags` を構築（`google_maps_provider` と同じ app-lifespan singleton）。
- `template.yaml` の `Api` に AppConfig の3つの環境変数（SSM経由）と
  `appconfig:StartConfigurationSession` / `GetLatestConfiguration` の完全ARN IAMポリシーを追加。
  `Migrate` には付けていない（フラグを読まないため最小権限）。
- ADR-008 に追補済み（`/app-config` のスキーマ、ダークローンチ不採用、
  `GOOGLE_MAPS_LOOP_ROUTE_ENABLED` は環境変数のまま残す判断、フラグ公開可否はコード所有）。
- テスト514件（新規追加分含む）green、ruff green、`sam validate --lint` green。

**未実施のまま残しているもの**: オーケストレータの明示判断（Q4: 実 AWS へのデプロイ・
配信操作は一切行わない）により、dev への実デプロイと CloudWatch Logs での動作確認
（プランの完了条件9）は未実施。特に `template.yaml` の IAM `Resource` ARN 組み立て
（[[feedback_cloudformation_sub_map_value_gotcha]] 参照）は `sam validate --lint` では
検証できない意味論的な修正を含むため、**次にこのブランチが dev にデプロイされる際は
CloudWatch Logs に `AccessDeniedException` on `StartConfigurationSession` が出ないことを
必ず確認すること**。

次は SS-99（フラグ切り替え GitHub Actions ワークフロー）、SS-100（mobile の消費）、
SS-101（最低サポートバージョンの強制アップデート導線）が続く。

**Why:** 実 AWS 環境への操作はオーケストレータ側の裁量事項であり、backend-developer は
ローカル(stub)・pytest・`sam validate --lint` の範囲で検証を完結させる方針だった。

**How to apply:** SS-99/SS-100 のプランニング・実装時にこの前提（dev実デプロイ未検証、
特にIAMのARN組み立てを直したばかり）を踏まえること。dev への最初のデプロイ時に
上記の確認を忘れないこと。
