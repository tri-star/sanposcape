---
name: project_ss137_sanpo_maps_module_review
description: SS-137(sanpo_maps/pinsモジュール統合)レビューで確認した、後続が踏襲すべきパターンと検査の限界。port撤去・M1の依存方向検査がM3の抜け穴も塞ぐ・Callable注入はレビューで見る
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-011-sanpo-maps-module-structure.md
  source_issue: SS-137
---

SS-137（`packages/backend/src/sanposcape/pins/` を `sanpo_maps/` 配下へ統合し、共有カーネル
+ `maps/`・`pins/`・`photos/` の3サブパッケージへ再編。`SanpoMapContents` Protocol port と
メソッド引数注入を撤去）はレビュー済み。Critical/High指摘なし。ADR-011の記述と実装が
一字一句レベルで一致（`maps/access.py`・`photos/cleanup.py`のdocstringがADR-011決定4の
表そのまま）。

確立された、後続チケット（BK-2, BK-7等がsanpo_maps/pinsに手を入れる場合）が踏襲すべきパターン:

- **port(Protocol)は撤去され、依存の向きに沿った部品・Repositoryクエリに置き換わった**:
  `PinService ⇄ SanpoMapService`の相互依存は無くなった。地図解決は`maps/access.py`の
  `SanpoMapAccess`（Session非保持・commitしない部品、pinsから使われる）、S3後始末は
  `photos/cleanup.py`の`PhotoObjectCleaner`（maps/pins両方から使われる）、ピン件数集計・
  写真キー収集は`maps/repository.py`の`SanpoMapRepository`のクエリへ移設。
- **依存方向はkernel ← photos ← maps ← pins の1本の列**（`sanpo_maps/tests/test_architecture.py`
  の`_ALLOWED_SUBPACKAGE_DEPENDENCIES`）。`sanposcape/dependencies.py`（アプリ直下）からは
  `sanpo_maps`への依存が完全に消えた（旧`get_sanpo_map_contents()`配線を撤去）。
- **M3(「service.pyは他のservice.pyをimportしない」)の抜け穴を懸念したが、実装確認の結果
  M1(依存方向AST検査)が実質的に塞いでいた**: `maps/access.py`・`photos/cleanup.py`はいずれも
  自サブパッケージ以下しかimportできないため、下位の部品を経由して上位のServiceへ到達する
  経路が構造的に存在しない。router.py各ファイルも自分のsubpackageのserviceしかimportしない
  ことをgrepで確認済み（2026-09-28時点）。
- **`test_no_protocol_ports`は `typing.Protocol`・`abc.ABC`/`ABCMeta` を基底に持つクラス定義を検出する**
  （当初は Protocol のみだったが、SS-137 のローカルレビュー対応で ABC 系も追加）。
  **コンストラクタで `Callable` を受け取り、呼び出し元が別サブパッケージの関数・メソッドを渡す
  「事実上の port」は AST では検出できない**ので、レビューで見る（ADR-011 の M5 に明記）。
- **M9（ユースケース層の導入条件）は ADR-011 決定3' で具体化済み**: (a) クエリの移設・部品化でも
  下位が上位の業務ロジックを呼ばずに済ませられないケースが1件でも出たら、(b) 複数サブパッケージに
  またがるユースケースが3つ以上になり持ち主の Service がばらけたら。導入時は「サブパッケージの
  `router.py` だけが `usecases` を import してよい」。次に循環しそうな設計を見たら、この条件に
  当たるか、port・メソッド引数注入で回避していないかを確認する。
- **トランザクション境界は3箇所（`delete_map`/`delete_pin`/`delete_photo`）で統一**:
  commit前にORM属性を退避 → `db.commit()` → commit後にbest-effort cleanup（例外を外に
  出さない）という同じ形。`PhotoObjectCleaner.delete_best_effort`は`except Exception`で
  広く捕まえるが、`PinPhotoUploadService.delete_upload`（アップロード枠取り消し時の
  staging削除、`photos/service.py`）だけは`ObjectStorageUnavailableError`のみを捕捉して
  おり、想定外例外はrouterまで伝播しうる。統合前からの既存挙動で、SS-137 では直さず
  ADR-011「移行・対応が必要な事項」に別チケット候補として記録した。
- **M6（書き込みは所有サブパッケージのRepositoryのみ）はAST化されておらずレビュー専任**。
  `maps/repository.py`・`pins/repository.py`・`photos/repository.py`を確認した限り違反なし
  （他サブパッケージのテーブルはJOIN・集計の読み取りのみ）。

**Why**: BK-2（アカウント削除時の写真削除）・BK-7（招待・メンバー管理）が同じ
`sanpo_maps`ドメインに手を入れる可能性がある。上記パターンからの逸脱（新しいProtocol風の
抽象を導入する、`sanpo_maps`外からサブパッケージ内部にimportする、commit境界を崩す等）が
あれば指摘する。

**How to apply**: 今後`sanpo_maps`内でサブパッケージ間の双方向依存が必要になる設計を見たら、
まずADR-011のM1〜M9（下位のRepositoryへのクエリ移設・commitしない部品・最終手段としての
usecases層）を踏襲しているか確認する。port(Protocol)やメソッド引数注入で回避する設計が
出てきたら`test_no_protocol_ports`と`test_architecture.py`のM1検査に抵触するはずなので、
それが通っている場合は Callable 注入のような AST で見えない形を疑う。

関連: [[project_ss113_sanpo_map_management_api]], [[backend-layering-conventions]]
