---
name: pattern_bulk_insert_refresh_n1
description: add_all()でまとめてINSERTした後、forループで1件ずつdb.refresh()するとSQLAlchemy 2.0のRETURNING最適化を無駄にしN+1のSELECTを生む。SS-88 pins/repository.py で発見。
metadata:
  type: reference
  scope: durable
---

`pins/repository.py` の `PinRepository.add_photos()` / `add_tags()`（SS-88）で発見:

```python
self._db.add_all(photos)
self._db.flush()
for photo in photos:
    self._db.refresh(photo)   # N回の追加SELECT
```

このプロジェクトは SQLAlchemy 2.0 + PostgreSQL(`psycopg`) で、複数行の ORM INSERT でも
`RETURNING`（insertmanyvalues）でサーバー生成値（`server_default=func.now()` の `created_at` 等）
が `flush()` 時点で自動的に populate される。それにもかかわらず配列の各要素に `db.refresh()` を
ループで呼ぶと、`flush()` が既に取得済みの値を**わざわざ1件ずつSELECTし直す**ことになり、
確定処理のような時間予算がタイトな経路で無駄なDBラウンドトリップを増やす。

**単一オブジェクトの `create()` 系（`users/repository.py`, `walks/repository.py`,
`sanpo_maps/repository.py`, `pins/repository.py` の `create()`）が1回だけ呼ぶ `db.refresh()` は
既存踏襲パターンで問題ない**（N+1ではない）。問題にしているのは「複数件を `add_all()` した後に
ループで `refresh()` する」新しいパターンの方。

**How to apply:** 新しい repository メソッドで `add_all([...]); flush(); for x in [...]: db.refresh(x)`
という形を見たら、本当に refresh が必要か（サーバー側が生成する値がPython側のデフォルト値と
異なるか）を確認する。`created_at`（`server_default=func.now()`）程度なら大抵は flush 後に
既に populate されているはずなので、ループでの refresh は削除を提案してよい。
