---
name: feedback-walks-stats-test-gotchas
description: 固定クロックのTestClient fixtureはtest_settingsベースのclientの上に組む。module定数のmonkeypatchはimport先のnamespaceを対象にする
metadata:
  type: feedback
---

SS-42 の `GET /walks/stats` 実装時にハマった2点（自己解決したが再発しやすいので記録）。

1. **固定クロックの TestClient fixture は `client` ではなく `walks_client`（`test_settings` 注入済み）
   の上に組むこと。**
   `auth_headers` fixture は `test_settings`（`AUTH_MODE=real`, `auth_jwt_secret="x"*32`）の鍵でトークンを
   署名する。固定クロック版のサービスに差し替える fixture（例: `frozen_stats_client`）を素の `client`
   fixture の上に組むと、ambient な `.env` の秘密鍵と `test_settings` の秘密鍵が食い違い、トークン検証が
   401 になる（実際にこの順で失敗し、`walks_client` の上に組み直して解決した）。
   **Why:** `client` fixture は `get_db` しか override しない。`get_settings` の override は
   `walks_client` fixture が持っている。
   **How to apply:** 認証必須エンドポイントで DB 依存以外の差し替え（クロック注入など）を行う fixture は
   `walks_client` を土台にする。`client` を直接使うのは未認証系のテストだけ。

2. **モジュールレベル定数を `monkeypatch` するときは、定義元ではなく import 先の namespace を対象にする。**
   `walks/stats.py` で定義した `WALK_STATS_STREAK_CHUNK_SIZE` を `walks/service.py` が
   `from ... import WALK_STATS_STREAK_CHUNK_SIZE` している場合、
   `monkeypatch.setattr(stats_module, "WALK_STATS_STREAK_CHUNK_SIZE", 3)` は効かない
   （service.py はすでに import 済みの値を関数内で参照するグローバル名として見ているため、
   `service.py` 側の namespace を書き換える必要がある: `monkeypatch.setattr(service_module, ...)`）。
   チャンク境界越えのテスト（S-9 相当）を書くときは要注意。

関連: [[project-ss42-walks-stats-backend-complete]], [[backend-auth-mode-env-gotcha]]
