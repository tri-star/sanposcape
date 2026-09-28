---
name: project_ss113_sanpo_map_management_api
description: SS-113(地図の新規作成・管理API)レビュー結果。Critical/High無し。port依存性逆転パターンの新前例（SS-137で撤去、ADR-011のM1〜M9に置き換え）
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
  source_issue: SS-113
---

SS-113（`POST/PATCH/DELETE /sanpo-maps`・`GET /sanpo-maps?expand=pin_count`）はレビュー済み。
Critical/High指摘なし。プラン（SS-112マージ後の改訂版）の設計判断が実装に一貫して
反映されている（計画と実装の乖離なし）。一次記録は ADR-009 追補（決定25〜29）。

確立された、後続チケット（SS-117/SS-121/BK-7）が踏襲すべき新パターン:

- **（SS-137 で撤去済み）ドメイン間依存の逆転はProtocol port + 構造的部分型 + アプリ直下
  dependencies.pyで配線**: `SanpoMapContents`(Protocol、旧 sanpo_maps/contents.py)を
  `PinService`(旧 pins/service.py)がそのまま満たし（新しいクラスを作らない）、配線は
  `sanposcape/dependencies.py::get_sanpo_map_contents()`（ドメイン固有の`dependencies.py`に
  置くと逆方向importになるため）。`SanpoMapService`コンストラクタではなく**メソッド引数**で
  portを渡す（コンストラクタで受けるとDI組み立てが循環するため）。旧 test_dependency_direction
  （AST解析で`sanposcape.pins`のimport無しを固定）がこれを検証していた。**SS-137 で `pins` を
  `sanpo_maps` 配下へ統合し、port は撤去。依存方向は `sanpo_maps/tests/test_architecture.py`
  （M1〜M9, ADR-011）が引き続き AST で固定している。**以下はSS-113時点（port撤去前）の
  レビュー内容の記録として残すが、現在のパターンとしては [[project_ss137_sanpo_maps_module_merge_stage2_complete]]・ADR-011 を参照。
- **削除のトランザクション境界**: 地図行を`FOR UPDATE`でロック→権限確認→`contents.prepare_sanpo_map_deletion()`
  で写真キーを（ロック後に）収集→DB削除+既定地図繰り上げ→`db.commit()`→commit後にbest-effortクリーンアップ
  （例外を外に出さない）。`sanpo_maps/tests/test_service.py::test_cleanup_is_called_after_commit`が
  「cleanup呼び出し時点で別セッションから地図が見えない」ことを実地に固定しており、この境界は検証済み。
  SS-112の`PinService._delete_photo_keys_best_effort`をそのまま再利用（新しい削除部品を増やさない）。
  **SS-137 追補**: 上記の`test_cleanup_is_called_after_commit`は`sanpo_maps/maps/tests/test_service.py`
  （旧 sanpo_maps/tests/test_service.py）に、`_delete_photo_keys_best_effort`は
  `sanpo_maps/photos/cleanup.py::PhotoObjectCleaner.delete_best_effort`に移った。判定順序・
  commit境界は変わっていない。
- **既定地図(is_default)の不変条件**: 作成時に自分の既定が無ければ既定化、削除時に`updated_at DESC, id DESC`
  先頭へ繰り上げ。競合は部分一意インデックス違反をsavepoint(`db.begin_nested()`)で捕捉して諦める
  （「誰かが既定を作った/繰り上げた」= 不変条件は満たされるとみなすbest-effort設計）。
- **権限関数の3類型化**: 追加系(role only)/対象の持ち主を判定する更新・削除系(role, *, is_creator等)/
  地図そのものの管理系(role only, owner限定)。`sanpo_maps/permissions.py`のdocstringに明記。
- **同時実行のロック順序逆転は既知・許容のトレードオフとしてADRに明記済み**: `add_photos`/`create_pin`は
  `pins`行→地図行の順でUPDATE、地図削除は地図行→（CASCADEによる）`pins`行の順でロックするため、
  まれに（同一地図への複数端末同時操作でのみ）デッドロックしPostgreSQLが片方を500で中断しうる。
  DBはロールバックで整合するため許容（ADR-009決定28）。**このデッドロック可能性自体は再指摘不要**
  （既に文書化された受容済みリスク）。

**Why**: SS-117（mobile: ピン登録画面からの地図新規作成）、SS-121（mobile: 地図管理画面）、
BK-7（招待・メンバー管理）が同じ`sanpo_maps`/`pins`ドメインに手を入れる。上記パターンからの
逸脱（例: `sanpo_maps`が`pins`を直接import、port実装のための新規クラス乱立、削除のcommit境界を
崩す変更）があれば指摘する。

**How to apply**: **SS-137 で `sanpo_maps`/`pins` は1つのモジュールに統合され、port パターンは
撤去された。**今後 `sanpo_maps` 内のサブパッケージ（`maps`/`pins`/`photos`）間で依存が増える
設計を見たら、port ではなく ADR-011 の M1〜M9（依存の向きに沿った Repository クエリ・commit
しない部品・必要なら usecases 層）を踏襲しているか確認する。「なぜ招待・メンバー管理APIが
無いのか」「なぜ地図数上限が無いのか」はSS-113で意図的にスコープ外とされた決定であり、再指摘しない。

関連: [[backend-layering-conventions]], [[project_ss111_pin_read_api]], [[project_ss88_pin_photo_confirm_review]], [[feedback_verify_plan_concurrency_design_against_code]]
