---
name: project_ss98_feature_flags_architecture
description: フィーチャーフラグ基盤（SS-98）の構成はADR-008が正本。レビューで再利用する2つの教訓（「循環import回避」の根拠はgrepで確かめる、botocoreのmax_attemptsは再試行回数なのでtotal_max_attemptsを使う）。
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-008-deploy-release-separation.md
---

`GET /app-config` とフラグ評価の3層構成（`integrations/aws/appconfig.py` の transport、
`core/feature_flags.py` の評価、`app_config/router.py`）、`FEATURE_FLAG_MODE=real|stub` の
fail-safe、`_lifespan` での保持は `docs/adr/ADR-008-deploy-release-separation.md`
の SS-98 追補（D1〜D10）に記録されている。

**教訓1: 「循環 import を避けるため」という設計根拠は、grep で実際の import 方向を確かめてから評価する。**
SS-98 のプランは「`FlagDocument`/`FlagDocumentSource` を core 側に置くと循環 import になる」と
説明していたが、実際は core → integrations の一方向で、core 側に置いても循環しなかった
（Protocol なので実装側は import 不要）。PR #88 で ADR-008 追補 D3 の記述は「既存の
core → integrations の向きを踏襲した」に訂正済みで、配置自体は再指摘しない。

**教訓2: boto3 の `Config(retries={"max_attempts": N})` の `max_attempts` は初回を除く再試行回数。**
`1` は `total_max_attempts: 2` に解決される（botocore 1.43.93 で確認）。「再試行しない」なら
`total_max_attempts: 1` を使う（botocore 自身も推奨）。SS-98 では `max_attempts: 1` と書かれ、
「最悪ケースは2呼び出し」というコメントと食い違っていた。Lambda の29秒制約の下では時間予算の
見積もりが2倍ずれるので、boto3 クライアントを生成する PR では必ず確認する。

**How to apply:** `app.state` に外部クライアントを持たせる実装では `_lifespan` の finally から
`close()` が呼ばれているかも確認する（`HttpGoogleMapsProvider`・`AppConfigFlagSource` が先例）。

関連: [[backend-layering-conventions]]、[[adr002-auth-shared-codepath]]（real/fail-safe モード切替の起源）
