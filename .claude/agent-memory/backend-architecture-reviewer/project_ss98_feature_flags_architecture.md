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
   **なお SS-98 の PR #88 で、型の配置は変えずに ADR-008 追補 D3 の記述だけを
   「core → integrations の既存の向きを踏襲した（core 側に置くことも技術的には可能）」
   という正確な表現へ訂正済み。** 残すのは「根拠を鵜呑みにせず import グラフを見る」習慣の方。

**以下は SS-98 の PR #88 で修正済み。再指摘しないこと**（同じ構造を持つ別の実装を
レビューする際のチェック項目としてのみ使う）:

2. ~~`AppConfigFlagSource`が永続的なboto3クライアントを`_lifespan`のfinallyで
   `close()`していない~~ → `close()`を追加し`_lifespan`で呼ぶよう修正済み。
   `app.state`に外部クライアントを持たせる実装を見たら、`HttpGoogleMapsProvider`と
   同じく`close()`が`_lifespan`から呼ばれているかを確認する。
3. ~~`FlagSourceKind`（`Literal["appconfig","default","stub"]`）が3箇所に重複~~
   → `integrations/aws/appconfig.py`に定義を一本化し`core/feature_flags.py`が
   re-exportする形に修正済み。

4. **（PR #88 で外部レビューから出た指摘。同種の boto3 クライアント生成で必ず確認する）**
   `Config(retries={"max_attempts": N})` の `max_attempts` は**初回を除く再試行回数**で、
   `1` を指定すると `total_max_attempts: 2` に解決される（botocore が内部で変換する。
   1.43.93 で確認）。「リトライしない」つもりなら **`total_max_attempts: 1`** を使う
   （botocore 自身が `max_attempts` より `total_max_attempts` を推奨している）。
   SS-98 では `max_attempts: 1` と書かれており、コード上のコメント「SDK 側のリトライに
   任せない」「最悪ケースは Start + Get の2呼び出し」と食い違っていた。
   タイムアウト予算の見積もりが 2 倍ずれるため、Lambda の 29 秒制約がある文脈では実害が出る。

関連: [[backend-layering-conventions]]、[[adr002-auth-shared-codepath]]（同じ
real/fail-safeモード切替の流儀の起源）。
