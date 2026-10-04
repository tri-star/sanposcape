---
name: pattern-singleton-invariant-concurrency
description: 「ownerごとにちょうど1つ」のような不変条件は、部分一意インデックスで防げる方向（増える）と防げない方向（0になる）を分けて、判定→書き込み→commitがロックで直列化されているかを見る。SS-113 で見逃した観点。
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

SS-113（地図の作成・管理API）のローカルレビューでは、テスト網羅性が十分なことを確認して
OK としたが、既定地図の不変条件（owner ごとに既定地図はちょうど1つ）が同じ owner の
`create_map`/`delete_map` の同時実行で崩れる穴を見逃した（PR #103 の外部レビューで発覚）。

- 部分一意インデックスは「既定が2つになる」は防げるが、「既定が0になる」（唯一の既定地図の削除と
  作成が交差する、既定地図Aと非既定Bの削除が交差する）は防げない。
- `promote_latest_to_default()` の `UPDATE` が rowcount を見ておらず、選んだ候補が実行時に
  既に消えていても成功扱いだった。
- 対応は owner 単位の advisory lock（`sanpo_maps/maps/repository.py::SanpoMapRepository.lock_owner()`）
  による直列化。決定の正本は ADR-009 決定27 の 2026-09-27 追補
  （`docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md`）。

**Why:** 「テストが通っている」ことと「並行実行で不変条件が崩れない」ことは別の観点で、
逐次実行のテストだけでは後者を検出できない。

**How to apply:** `is_default` のような「唯一」「ちょうど1つ」を保証する列を書き込むメソッドを
レビューするときは、
- 一意制約で防げる方向と防げない方向を分けて考え、防げない方向に直列化手段（advisory lock、
  `FOR UPDATE` 等）があるかを確認する。
- 判定（SELECT）から書き込み・commit までの区間がロックの内側にあるかを確認する。
- `UPDATE`/`DELETE` の rowcount を見ずに成功扱いしている箇所が無いかを確認する。
