---
name: project-ss33-review-followup
description: SS-33 (周回ルート/loop route) のローカルレビュー「修正予定(自律対応)」全件への対応履歴と実装場所
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

## 経緯

`tri-star/SS-33-claude` ブランチに対して backend-architecture-reviewer /
backend-security-reviewer / backend-code-quality-reviewer / doc-maintainer のローカル
レビューを実施した。「修正予定(自律対応)」に分類された項目は親エージェント承認済みとして
全件対応した（2026-09-15）。「要ユーザー対応」の実API検証(B7)はスコープ外のまま。

## 対応した項目と実装場所

1. **QUALITY-1 / ARCH・QUALITY-Suggestion**（`maps/service.py`）: 候補取得ループ内で
   `GoogleMapsQuotaError`/`GoogleMapsUnavailableError` を捕捉した時点で即座に
   side別のログ（Quotaは WARNING、Unavailableは INFO）を出すようにした。以前は
   「両側とも失敗」の集約ログにしか出ておらず、片側だけ成功したケースでもう片方の
   Quotaが運用ログから見えなくなっていた。
2. **QUALITY-2**（`maps/tests/test_service.py`）: `future.result()` がQuota/Unavailable
   以外の例外（プログラムのバグ）を握りつぶさず再送出することを固定する回帰テストを追加。
3. **ARCH-Warning**（`integrations/google_maps/client.py`）: `_request()` が単一の
   `float` を `httpx` の `timeout=` に渡していたため、`connect_timeout_seconds`
   （既定3秒）が `route_deadline_seconds`（最大25秒）に実質上書きされていた。
   `httpx.Timeout(timeout_seconds, connect=min(connect_timeout_seconds,
   timeout_seconds))` に変更。httpxの挙動は `request.extensions["timeout"]` を
   `httpx.MockTransport` のhandlerで読むと検証できる（下記「判明した事実」参照）。
4. **SEC-L1**（`maps/loop_route.py`）: origin/destinationの距離バリデーションは
   既存walkingとの一貫性を優先して追加せず、代わりに `_resample_step_meters()` で
   1 legあたりのresample点数を上限（既定2000点）に有界化した。
5. **QUALITY-Suggestion**: `outcomes` の型を `dict[LoopSide, ...]` に変更、
   `_return_overlap_ratio` のeligible_cells空境界（O-D間51m）テスト追加、
   `get_maps_service` のkill switch配線テスト追加（`maps/tests/test_dependencies.py`）。
6. **QUALITY-3**（`scripts/loop_route_probe.py`）: 逐次取得だったのに「左右並列」と
   ラベルしていた（本番は`ThreadPoolExecutor`で並列）。本番と同じ並列取得に変更し、
   p90計測値が本番の約2倍に水増しされる問題を解消した。
7. **DOCS 1〜11 + コード内tmp参照**: ADR-007の実装との乖離（「片方失敗時のみ最大3回」の
   誤記3箇所、決定6の理由欠落）、`GOOGLE_MAPS_ROUTE_DEADLINE_SECONDS`の説明修正
   （config.py/.env.example/local-env.md）、ADR-002 6-1追補、kill switchの本番操作手順
   （template.yaml + deployment.md、`DB_DISABLE_PREPARED_STATEMENTS`と同じ「既定では
   書かない」方針を踏襲）、naming-convention.md/folder-structure.md/project-overview.md/
   README.mdの更新、コード内の`backend-plan.md`参照をADR-007参照に置き換え。

## 判明した事実（次回も使える）

- httpxは`timeout=`に単一floatを渡すとconnect/read/write/poolの全フェーズに同じ値を
  適用する。`httpx.MockTransport`のhandler内で`request.extensions["timeout"]`を読むと
  実際に適用されたtimeoutの内訳（dict）をテストで検証できる。
- 本セッションでの反省: フィックスの検証のためソースを一時的に壊して`pytest`を実行した後、
  まだ一度もcommitしていないファイルを`git checkout -- <file>`で元に戻そうとして、
  自分が書いた修正ごと消してしまった（HEADには元のレビュー前コードしか無いため）。
  未コミットの変更を検証目的で一時的に壊す場合は、`git checkout`ではなく手動で
  元の文字列に戻す（Editツールで逆方向に置換する）か、先にWIPコミットしてから
  壊す・戻す（`git diff`で確認してから`git reset`する）こと。詳細は
  [[feedback-verification-revert-without-git-checkout]]。
- 今回もopenapi.yamlの再生成diffは0だった（schemas.py/router.pyを一切変更していない
  ため）。API契約を変えないレビュー対応では再生成しても差分が出ないのが正常
  （[[reference-openapi-json-gitignored]]と同種のパターン）。

関連: [[project-ss33-loop-route-backend-complete]] / [[feedback-commit-splitting]]
