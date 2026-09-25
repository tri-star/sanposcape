---
name: project-ss113-sanpo-maps-management-api-complete
description: SS-113 backend（地図の新規作成・更新・削除API、pin_countのexpand、sanpo_maps/contents.py port）は実装完了。次はmobile側SS-117/SS-121
metadata:
  type: project
  scope: task-local
  source_issue: SS-113
---

SS-113（BK-6: `POST`/`PATCH`/`DELETE /sanpo-maps`・`GET /sanpo-maps?expand=pin_count`）は
2026-09-26 に backend 実装が完了した（worktree `ss-113`、ブランチ `tri-star/ss-113`、
main 71e2d9c からの10コミット）。

**変更ファイル**: `sanpo_maps/{router,service,repository,schemas,permissions,exceptions}.py`、
新規 `sanpo_maps/contents.py`（`SanpoMapContents` Protocol/port）・`sanpo_maps/mappers.py`
（`to_sanpo_map_read()`）。`pins/{repository,service}.py` に地図単位のピン件数集計・写真キー
収集メソッドを追加（`PinService` が port を構造的部分型で満たす）。配線は
`sanposcape/dependencies.py` の `get_sanpo_map_contents()`（`sanpo_maps/dependencies.py` には
置かない。pins→sanpo_mapsの一方向依存を保つため）。`main.py` に `/sanpo-maps` 用の
`RequestSizeLimitMiddleware` を追加。`openapi.yaml` 再生成済み。

**テスト**: `sanpo_maps/tests/test_dependency_direction.py`（新規、`sanpo_maps` 配下が
`sanposcape.pins` を import しないことを AST で検査）、`pins/tests/test_sanpo_map_management.py`
（新規、CASCADE削除・S3実体削除・staging保持・容量解放・IDOR・expand集計の結合テスト。
`sanpo_maps→pins` の依存方向に合わせて pins 側に配置）。

**設計の要点**（ADR-009 決定25〜29、backend `docs/adr/ADR-009-*.md` の「追補（2026-09-26,
SS-113 地図の作成・管理 API）」に一次記録）:
- 依存性逆転で `sanpo_maps→pins` の逆依存を作らない。port は `PinService` が直接満たし
  （新しいクラスを増やさない）、SS-112 由来の `_delete_photo_keys_best_effort()` をそのまま
  再利用する。
- 既定地図（`is_default`）は作成時に自動既定化、削除時に `updated_at DESC, id DESC` の
  先頭へ繰り上げ（savepoint で競合を吸収）。
- 地図そのものの操作（PATCH/DELETE）は owner のみ（`can_update_sanpo_map`/
  `can_delete_sanpo_map`、role のみで判定。ピンの権限関数のような `is_creator` 引数は無い）。

**未着手**: mobile 側 SS-117（ピン登録画面からの地図作成）・SS-121（地図の一覧・管理画面）。
mobile の Orval fetcher シグネチャ変更（`listSanpoMaps(params?, options?)`）への追従
（`sanpoMapApi.ts` の1行修正）は本チケットの backend PR に含めて完了済み。

判断ログの一次記録は ADR-009 の「追補（2026-09-26, SS-113 地図の作成・管理 API）」（決定25〜29）。
PR 作成前に SS-124（mobile, 並行中）が `sanpoMapApi.ts` に触れていないか再確認すること。
