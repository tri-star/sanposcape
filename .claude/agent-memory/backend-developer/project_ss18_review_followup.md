---
name: project-ss18-review-followup
description: SS-18 (walks/散歩記録) のローカルレビュー指摘への対応履歴。承認された4項目の対応内容と判断ログ
metadata:
  type: project
---

## 経緯

ブランチ `feat/ss-18-walk-record`（walks ドメインの実装、10コミット済み）に対して
backend-security-reviewer / backend-architecture-reviewer / backend-code-quality-reviewer /
doc-maintainer の4エージェントでローカルレビューを実施し、結果を
`tmp/SS-18/local-review.md` にまとめた（このファイルは gitignore 対象で追跡されない）。
親エージェント・ユーザーが承認した4項目のみ対応した（C-1, C-3, C-5〜C-7, ADR化 等は見送り）。

## 対応した4項目と実装場所

1. **A-1**: `GET /walks` の `started_after` / `started_before` を `datetime` → `pydantic.AwareDatetime` に変更（`walks/router.py`）。naive datetime を渡すと DB 側で暗黙変換されサイレントに誤った範囲でフィルタされる問題への対応。回帰テストは `walks/tests/test_router.py::TestListWalks::test_naive_started_after_returns_422` 等。
2. **B-1**: `walks/tests/test_router.py` に `track` の境界値テスト（ちょうど `MAX_TRACK_POINTS` で201、空配列 `track: []` で201）を追加。
3. **C-2 + folder-structure整合**: `RequestBodyTooLargeError` と `RequestSizeLimitMiddleware` を `main.py` から `core/middleware.py` へ移動。パスマッチも `startswith` から「完全一致 or `prefix + "/"` で始まる」に修正（`/walksfoo` のような誤マッチを防止）。例外ハンドラの登録（`register_exception_handlers`）は方針通り `main.py` に残し、双方に相互参照コメントを記載。境界値テストは新設 `core/tests/test_middleware.py`。
4. **ドキュメント更新**: `packages/backend/docs/naming-convention.md`（「散歩ルート」命名の実例差し替え、`mappers.py` の基本セット化、`...DetailRead`/`...ListRead` 接尾辞、`uq_`/`ix_` 命名規則）、`folder-structure.md`（`walks/` の説明修正、`core/` の説明拡張、`GeoPoint` 昇格時の再エクスポート運用、`exceptions.py` 削除・`all_models.py` 追加）、`local-env.md`（`WALKS_REQUEST_MAX_BYTES` 追記、「リクエストサイズ制限」節の新設、compose.yaml 省略 env リストの実態化）を修正。`docs/` 直下と `README.md` は親エージェント側の担当なので触っていない。

## 判明した事実（次回も使える）

- `pydantic.AwareDatetime` は `datetime | None` と OpenAPI 上のスキーマ表現が同一（`type: string, format: date-time`）。tz-aware 化しても `openapi.yaml` に差分は出ない。「API変更したら openapi.yaml 再出力」を怠っていないか確認する際、diffが0でも異常ではない（[[reference-openapi-json-gitignored]] と同種の「diff無し=正常」パターン）。
- `core/middleware.py` を新設した際、コードの移動のみ（ロジック不変）でも `openapi.yaml` は無変化。
- `packages/backend/compose.yaml` の `environment:` に列挙されていない env（＝ドキュメントで「意図的に省略」と説明すべき対象）は `config.py` の `Settings` フィールドと突き合わせて確認するのが確実（ドキュメントの記述が古くなりやすい箇所）。SS-18 時点で実際に省略されているのは10個（`AUTH_TOKEN_ISSUER`/`AUTH_TOKEN_AUDIENCE`/`GOOGLE_JWKS_URL`/`GOOGLE_ALLOWED_ISSUERS`/`GOOGLE_JWKS_CACHE_LIFESPAN_SECONDS`/`GOOGLE_MAPS_CONNECT_TIMEOUT_SECONDS`/`GOOGLE_MAPS_READ_TIMEOUT_SECONDS`/`GOOGLE_MAPS_MAX_PLACE_CANDIDATES`/`GOOGLE_MAPS_MAX_ROUTE_REQUESTS_PER_SEARCH`/`WALKS_REQUEST_MAX_BYTES`）。

## 見送った指摘（C-1, C-3〜C-7, D-1のproject-overview.md/milestones.md, D-2, D-3のREADME.md, ADR化）

親エージェント／ユーザーの承認範囲外だったため未対応。特に `docs/` 直下と `README.md` は
親エージェントが別途対応する分担だったので、意図的に触っていない。
