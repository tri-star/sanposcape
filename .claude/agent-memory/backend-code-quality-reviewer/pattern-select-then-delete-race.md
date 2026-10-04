---
name: pattern-select-then-delete-race
description: select→session.delete()→flush 方式の物理削除は、真に同時な2重DELETEで後発側が「0行削除なのに成功」になりうる（version_id_col が無いと StaleDataError ではなく SAWarning止まり）。新しい delete() を見たら walks の手当てを踏襲しているか確認する。
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-003-walk-record-persistence-and-history-api.md
---

`walks/repository.py::WalkRepository.delete()`（SS-53）と `users/repository.py::UserRepository.delete()`
は、どちらも「SELECT で存在確認 → `session.delete()` → `flush()`」の形。

同一IDへの真に同時な2重DELETE（モバイルのタイムアウト再送・連打）では、後発側の DELETE は
先発側の commit まで行ロックで待たされ、再開時には0行ヒットになる。

**落とし穴:** モデルに `version_id_col` が無いと、SQLAlchemy の `confirm_deleted_rows` は
これを `StaleDataError`（例外）ではなく **`SAWarning`（警告）としてのみ報告する**。
`flush()` は成功したように見え、`delete()` が `True` を返してしまう
（ADR-003 決定13「2回目の DELETE は404」に反する誤った成功応答）。

**確立済みの手当て（walks）:** `flush()` の間だけ
`warnings.simplefilter("error", sa_exc.SAWarning)` で警告を例外に昇格させ、`StaleDataError`
（将来 `version_id_col` を足した場合に備える）と合わせて捕捉し `False` を返す
（呼び出し元は通常の404扱い）。理由は `WalkRepository.delete()` の docstring に詳述されている。

**users は意図的に未対応**: `UserRepository.delete()` の docstring に「既知の未対応事項」として
同じ問題と walks の対処法への参照が書かれている（アカウント削除は連打されにくく、成否の呼び分けも
無いため）。users 側を「未対応のバグ」として再指摘しない。

**How to apply:** 新しい `repository.delete()`（select→delete→flush 方式）を見たら、
- 削除の成否を呼び出し元が区別する（404等）なら、walks と同じ `SAWarning` 昇格＋捕捉があるか確認する。
  `StaleDataError` だけを捕捉しているなら、`version_id_col` 無しでは何も捕まらないので指摘する。
- 区別しないなら、users のように docstring に未対応の理由が書かれているかを確認する。
- 指摘時は「発生頻度は低いが、モバイルは再送しやすい通信環境」という文脈を添える。

関連: [[pattern_expired_orm_attr_in_post_commit_log]]（同じ「削除まわりの SQLAlchemy の罠」系）。
