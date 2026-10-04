---
name: project_ss137_sanpo_maps_module_review
description: sanpo_maps モジュール構成はADR-011（M1〜M9）が正本。レビューで見るべき、ASTで検査されない点（Callable注入の事実上のport・M6）と、受容済みで再指摘しない点。
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-011-sanpo-maps-module-structure.md
  source_issue: SS-137
---

SS-137 で `pins/` は `sanpo_maps/` 配下に統合され、共有カーネル + `maps/`・`pins/`・`photos/` の
3サブパッケージになった。Protocol port（旧 `SanpoMapContents`）とメソッド引数注入は撤去済み。
規則（依存方向 kernel ← photos ← maps ← pins、M1〜M9、ユースケース層の導入条件 = 決定3'）は
`docs/adr/ADR-011-sanpo-maps-module-structure.md` が正本で、
`sanpo_maps/tests/test_architecture.py` が AST で固定している。

**レビューで人が見る点（AST で検出できない）:**
- コンストラクタで `Callable` を受け取り、呼び出し元が別サブパッケージの関数・メソッドを渡す
  「事実上の port」（ADR-011 M5 のレビュー観点）。`test_no_protocol_ports` は Protocol/ABC の
  クラス定義しか検出しないので、テストが通っていてもこの形を疑う。
- M6（テーブルへの書き込みは所有サブパッケージの Repository だけ）。他サブパッケージのテーブルを
  JOIN・集計以外で触っていないかを見る。
- 削除系（`delete_map`/`delete_pin`/`delete_photo`）のトランザクション境界は「commit 前に ORM 属性を
  退避 → `db.commit()` → commit 後に best-effort cleanup（例外を外に出さない）」で統一されている。
  崩す変更は指摘する。

**再指摘しないこと:**
- ピン追加/写真追加（`pins` 行 → 地図行の順でロック）と地図削除（地図行 → CASCADE で `pins` 行）の
  ロック順序逆転による稀なデッドロックは、受容済みのリスク（ADR-009 決定28）。
- `PinPhotoUploadService.delete_upload` が `ObjectStorageUnavailableError` しか捕捉しない点は、
  ADR-011「移行・対応が必要な事項」に別チケット候補として記録済み。

関連: [[backend-layering-conventions]]
