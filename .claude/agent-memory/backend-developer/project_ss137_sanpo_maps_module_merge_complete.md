---
name: project-ss137-sanpo-maps-module-merge-complete
description: SS-137（sanpo_maps と pins のモジュール統合）は段階1(配置移動)・段階2(Service再設計)・段階3(ADR-011・docs・agent-memoryのパス更新)まで実装完了
metadata:
  type: project
  scope: task-local
  source_issue: SS-137
---

SS-137: `packages/backend/src/sanposcape/pins/` を `sanpo_maps/` 配下へ統合し、
`sanpo_maps/{maps,pins,photos}/` の3サブパッケージ + 共有カーネル（直下の
`models.py`/`exceptions.py`/`permissions.py`/`advisory_locks.py`）に再編する作業を、
**段階1（配置の移動のみ）・段階2（Service の再設計、`SanpoMapContents` port 撤去）・
段階3（ADR-011 新規作成、ADR-009 追補、docs 更新、agent-memory のパス更新）まで完了**
した（2026-09-28、ブランチ `tri-star/ss-137`）。

**Why:** 次に `sanpo_maps`/`pins` に手を入れるセッションが、どのコミットで何が変わったか・
現在のモジュール構成・一次記録の場所（ADR-011）をすぐ把握できるようにするため（task-local。
チケット完了時の knowledge-harvest で削除・統合の判断対象）。

**How to apply:**
- コミット: `b6cfc0d`（1a: `git mv` による1対1移動 + import書き換え）・`fa46c58`
  （1b: models/exceptions のカーネル統合、`SanpoMapRole` の permissions.py への移動、
  `PinPhotoUploadService` 等を `photos/` へ切り出し）・`098dc60`（2: Service 再設計。
  `SanpoMapContents` port 撤去、`sanpo_maps/advisory_locks.py`・`sanpo_maps/maps/access.py`・
  `sanpo_maps/photos/cleanup.py`・`sanpo_maps/tests/test_architecture.py` 新設）・
  段階3（ADR-011 新規・ADR-009 追補・`packages/backend/docs/` 更新・agent-memory のパス更新）。
  `pytest -q` は 1a/1b で1116 passed（変更前と同数）、2 で1129 passed（+13。
  内訳: `pins/tests/test_service.py` から `TestCountPinsForSanpoMaps`・
  `TestPrepareSanpoMapDeletion`・`TestPinServiceDeleteTimeBudget` 計7件を削除/移動、
  `sanpo_maps/photos/tests/test_cleanup.py` 新設9件、`sanpo_maps/tests/test_architecture.py`
  新設9件が旧 test_dependency_direction 2件を置き換え、
  `sanpo_maps/tests/test_advisory_locks.py` 新設3件、`TestDeleteMap` に1件追加。
  計 -7+9+7+3+1=+13）。段階3はテストの追加・削除を伴わないため1129のまま。各コミットで
  `openapi.yaml` 差分ゼロ・`alembic check` 差分なしを確認済み。
- **一次記録は [ADR-011](../../../docs/adr/ADR-011-sanpo-maps-module-structure.md)**
  （モジュール構成・モジュール内規則 M1〜M9・Service 循環の解き方・旧パス→新パス対応表・
  検討した選択肢）。ADR-009 には決定28・29 に SS-137 追補の注記を入れ、要約
  （`## 現在有効な決定（要約）`）も更新済み。`packages/backend/docs/folder-structure.md` に
  「複数エンティティを持つドメイン（`sanpo_maps/`）」節を新設し、`naming-convention.md`・
  `deployment.md`・`toolsets-libraries.md`・`integrations/aws/s3.py` のコメント・
  `.claude/skills/review-tour/references/viewpoint-catalog.md` のパスも更新済み。
- **現時点のモジュール構成**: `sanpo_maps/{models.py,exceptions.py,permissions.py,
  advisory_locks.py}`（共有カーネル）+ `sanpo_maps/maps/`（`access.py` を含む）・
  `sanpo_maps/pins/`・`sanpo_maps/photos/`（`cleanup.py` を含む）。`sanposcape.pins`
  パッケージ・`SanpoMapContents` port（旧 sanpo_maps/contents.py）・アプリ直下
  `dependencies.py` の `get_sanpo_map_contents()` は存在しない。`PinService` と
  `SanpoMapService` は互いを import・保持・呼び出ししない（`sanpo_maps/tests/
  test_architecture.py` の9検査が M1〜M5・M7・M8・番兵を AST で固定）。advisory lock の
  namespace バイト列（`b"sanposcape.sanpo_maps.owner"`・`b"sanposcape.pins.pin_photo_uploads"`）
  は モジュールパスではなくロックキーそのものなので、2度の再編後も意図的に変更していない。
- **`sanpo_maps/tests/test_architecture.py` の実装ハマりどころ**: 直下（カーネル）だけを
  見る2検査（`TestTopLevelHasOnlyKernelModules`・`TestKernelDoesNotImportSubpackages`）は、
  `conftest.py` を除外し忘れると `sanpo_maps/conftest.py` 自身を違反として誤検出する
  （`conftest.py` は `maps.repository`・`photos.photo_keys` を import するため）。
  「`conftest.py`・`__pycache__` を除く」という除外条件は、`_iter_module_files()` のような
  汎用ヘルパー1箇所に集約し、直下専用の検査にも同じヘルパー（`_iter_top_level_files()`）を
  使わせること。
- **段階2の各 AST 検査は、一時的に違反コードを追加 → 該当テストを `pytest -k` で単体実行して
  失敗を確認 → 元に戻す、を9検査すべてで実施済み**（M2・M1×2・M3・M4・M7・M8・M5・番兵）。
  `git checkout --` は使わず Edit の往復で戻した（未コミットの段階2変更を消さないため。
  →[[feedback-verification-revert-without-git-checkout]]）。
- **agent-memory の staleness 検査は「バッククォート内かつ既知拡張子で終わる」トークンだけを
  見る**（`scripts/knowledge/check-memory-staleness.py`）。削除済みファイル（旧
  sanpo_maps/contents.py・旧 test_dependency_direction.py）を経緯として書くときは、
  ファイル名をバッククォート + `.py` で終わる形にすると「存在しないパス」として誤検出される。
  クラス名・テスト名（拡張子なし）で言及するか、地の文（バッククォート無し）で書くと検出対象に
  ならない。→[[feedback-backend-file-relocation-gotchas]]
