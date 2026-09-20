---
name: project_ss98_feature_flags_architecture
description: SS-98 AppConfigフィーチャーフラグ基盤の3層構成と、integrations側にProtocol/DTOを置く判断の妥当性検討（再指摘しない/次回確認する点）
metadata:
  type: feedback
  scope: durable
---

SS-98（`ss-98`ブランチ、2026-09-20時点）で `GET /app-config` とフィーチャーフラグ評価
基盤が入った。構成は3層:

- `integrations/aws/appconfig.py`: boto3 `appconfigdata` の transport 層。
  `FlagDocument`(dataclass) / `FlagDocumentSource`(Protocol) / `AppConfigFlagSource` /
  `StubFlagSource` / `UnconfiguredFlagSource` / `build_flag_document_source()`。
- `core/feature_flags.py`: 評価層。`FEATURE_FLAGS` 登録簿（公開可否の正典はコード側）+
  `FeatureFlags.is_enabled/client_flags/minimum_supported_versions/source_kind`。
  `FlagDocument`/`FlagDocumentSource` を `integrations` からimportして使う（`core →
  integrations`）。
- `app_config/`: `router.py`のみ（`service.py`無し。`health/`と同じ判断）。

モード切替は `AUTH_MODE`/`MAPS_MODE`と同型（`FEATURE_FLAG_MODE=real|stub`、既定real、
`_validate_environment_settings`の許可リストブロックに1行追加、ID未設定→
`UnconfiguredFlagSource`でAWSを一切呼ばない）。保持は`main.py`の`_lifespan`→
`app.state.feature_flags`（`google_maps_provider`と同型）。テスト・実装は高品質
（境界条件・フェイルセーフ・StreamingBody再読み不可・トークン期限切れ・botocore
Stubberでのパラメータ名固定まで網羅済み）。詳細は ADR-008 の「SS-98追補」参照。
[[backend-layering-conventions]]

**Why（この指摘を持つ理由）:** レビュー時に設計プランの根拠を鵜呑みにせず実際の
import グラフを検証したところ、根拠の一部が不正確だと分かったため。同種の
「循環importを避けるため」という説明が出てきたら、まず実際にgrepしてから妥当性を
判断する習慣を残す。

**How to apply（次回このあたりを触るPRで確認する点）:**

1. **「`FlagDocument`/`FlagDocumentSource`をintegrations側に置く理由＝core側に置くと
   循環importになる」という設計プランの説明は技術的に不正確。** grep で確認した
   ところ、`integrations/aws/appconfig.py`側は`core/feature_flags.py`から何も
   importしていない（一方向: core→integrations）。型定義をcore側に移しても
   integrations→coreの一方向になるだけで循環にはならない（`FlagDocumentSource`は
   Protocolなので構造的部分型が効き、実装側は明示的にimport/継承しなくても良い）。
   古典的なポート&アダプタ（Hexagonal）では「ポート（Protocol）は使う側＝core、
   実装（Adapter）はintegrations」が素直な向きで、今回はそれと逆になっている。
   実害は無い（動く・テストは通る・`core/runtime_config.py → integrations/aws/secrets.py`
   という既存の`core→integrations`前例とも一応整合する）ため、Critical/Warningではなく
   コメントの正確性の問題として指摘した（2026-09-20のレビューではWarning級）。
   次にこのファイルを触る/似た設計をする時、同じ「循環import」根拠が再度出てきたら、
   まずgrepで実際にimport方向を確認すること。
2. `AppConfigFlagSource`は永続的なboto3クライアント（urllib3コネクションプール保持）を
   `self._client`に持つが、`_lifespan`のfinallyで`close()`されていない
   （`HttpGoogleMapsProvider`は`provider.close()`されるのと非対称）。実害は小さい
   （Lambdaはコンテナ凍結、ローカルはプロセス終了時にGC）が、対称性の観点でLow指摘。
3. `FlagSourceKind`（`Literal["appconfig","default","stub"]`）が
   `integrations/aws/appconfig.py`・`core/feature_flags.py`の`source_kind()`戻り値・
   `app_config/schemas.py`の3箇所に同じLiteralとして重複している。型不一致は
   テストで即座に露見するため実害は薄いが、DRY観点のLow指摘候補。

関連: [[backend-layering-conventions]]、[[adr002-auth-shared-codepath]]（同じ
real/fail-safeモード切替の流儀の起源）。
