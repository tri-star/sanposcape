---
name: pattern_select_then_delete_race
description: select→session.delete()→flush 方式の物理削除で起きうる StaleDataError レース（users/walks 両リポジトリに存在）。新しい delete() を見たら確認する。
metadata:
  type: reference
---

`users/repository.py:UserRepository.delete()` と `walks/repository.py:WalkRepository.delete()`（SS-53）は、どちらも次の形。

```python
walk = self._db.scalars(select(...).where(id==, user_id==)).first()
if walk is None:
    return False
self._db.delete(walk)
self._db.flush()
return True
```

**問題:** SQLAlchemy は主キー指定の DELETE で「期待した行数が実際に削除されたか」をデフォルトで確認しており（`version_id_col` 未設定でも有効）、一致しないと `sqlalchemy.orm.exc.StaleDataError` を送出する（[SQLAlchemy公式Exceptionsドキュメント](https://docs.sqlalchemy.org/en/20/orm/exceptions.html)）。

同一 `walk_id`/`user_id` に対する2つの同時実行リクエスト（同一クライアントのタイムアウトリトライ・二重タップなど）が競合すると:
1. 両方の SELECT が削除前の行を見つける（READ COMMITTED では未コミットの DELETE は他トランザクションから見えないため）。
2. 先勝ちしたリクエストが DELETE + commit。
3. 後勝ちのリクエストの DELETE は対象行が既に無く 0 行 → `StaleDataError` が flush 時に送出される。

このエラーは `main.py` の `@app.exception_handler` に登録されていない（登録済みなのは `WalkNotFoundError` / `MapsQuotaError` / `MapsUnavailableError` / `InvalidCursorError` のみ）ため、素通りして 500 になる。ADR-003 決定13は「削除は冪等にしない（2回目は404）」と明記しているが、この競合時は 404 ではなく 500 になってしまう。

**How to apply:** 新しい `repository.delete()`（select→delete→flush 方式）を見たら、`StaleDataError` を捕捉して `False`（呼び出し元は404扱い）に変換しているか確認する。`users/repository.py` にも同型の未対応バグが存在する（このPRで新規に生んだものではなく、既存パターンを踏襲した結果、同じ穴が2つ目のドメインにも広がった）。指摘时は「発生頻度は低いが、モバイルはリトライしやすい通信環境」という文脈を添えると説得力が増す。
