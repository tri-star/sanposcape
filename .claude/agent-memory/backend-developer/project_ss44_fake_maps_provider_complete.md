---
name: project-ss44-fake-maps-provider-complete
description: SS-44（backend: MAPS_MODE=fakeで切り替える決定的なfake Maps provider）は実装完了。SS-21のMaestro E2Eブロッカー解消
metadata:
  type: project
---

SS-44「backend: E2E用の決定的なfake Maps providerをMAPS_MODEで切り替えられるように
する」は `feat/ss-44-fake-maps-provider` ブランチで実装完了（2026-08-08）。5コミット
（`8babab7`〜`a8dec4f`）で `Settings.maps_mode` 追加・`FakeGoogleMapsProvider` 新設・
`build_google_maps_provider` の分岐追加・テスト・ドキュメント更新まで完了。
`docker compose exec api uv run pytest` は225 passed、`ruff check`/`format --check` も
通過、`openapi.yaml` に差分なし。手動確認（`MAPS_MODE=fake docker compose up -d` →
`/explore/places` を2回叩いて完全一致・5件、`ENV=production MAPS_MODE=fake` で起動失敗）
も実施済み。PR はまだ作成していない。

**Why:** CI・キー未所持のローカルでは `build_google_maps_provider()` が
`UnconfiguredGoogleMapsProvider` を返し `/explore/places` が常に503になり、
SS-21のMVPフローE2E（散歩開始→終了→保存→履歴）が実行できなかった。
`AUTH_MODE`（ADR-002決定4）と同じfail-safe方針（許可リスト方式のバリデーション）を
Mapsに横展開した。新規ADRは作成していない（既存決定の適用のため）。

**How to apply:**
- `FakeGoogleMapsProvider`（`integrations/google_maps/fake.py`）は origin から
  北東45°方向へ200/400/600/800/1000mの等間隔で最大5件の候補を返す決定的な実装。
  乱数・時刻・TTLキャッシュは一切使わない契約。distance計算は equirectangular近似の
  プライベート関数で、`core/geo.py`（Pydantic `GeoPoint`、距離計算なし）へは昇格させて
  いない（利用者がfake.py 1箇所のみのため）。2人目の利用者が出たら昇格を検討する。
- `MAPS_MODE=fake` は `ENV=local`/`test` 限定。それ以外は `Settings` の
  `_validate_environment_settings`（旧`_validate_auth_settings`からリネーム）で起動時
  `ValueError`。
- 申し送り事項（本タスクのスコープ外・SS-21or後続issueで対応）: 
  `.github/workflows/mobile-e2e.yml` から `--exclude-tags=maps-required` を外す作業と、
  同ファイル冒頭の `TODO(SS-44)` ブロック・「backendにmaps_modeが無いため無視される」
  コメント（104-105行付近）の削除・修正。CI側は既に `MAPS_MODE=fake` を渡しているため
  env追加作業は不要。
- 詳細は `tmp/SS-44/backend-plan.md`（判断根拠D-1〜D-7）と `tmp/SS-44/session-recap.md`
  を参照。

**追記（2026-08-08 ローカルレビュー対応完了）**: `review-quality.md`/
`review-architecture.md` の指摘7件（`limit>=3`前提のdocstring明記、極付近ガード/
`_clamp`の直接テスト追加、所要時間アサーションの二重丸め解消、負の`limit`テスト、
`D-6`参照コメントの自己完結化、`2**0.5`のモジュール定数化、`maps/tests/test_service.py`
の`FakeProvider`と`FakeGoogleMapsProvider`の混同防止docstring）に対応済み。
`docker compose exec api uv run pytest` 227 passed、`ruff check`/`format --check`
グリーン。コミットは指摘1件=1コミットを基本に7分割（`65f1068`〜`905b52b`）。
API挙動・スキーマの変更なし。
