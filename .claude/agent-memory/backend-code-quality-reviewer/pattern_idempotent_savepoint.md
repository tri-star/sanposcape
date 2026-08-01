---
name: pattern_idempotent_savepoint
description: 一意制約による冪等 INSERT を savepoint + IntegrityError 捕捉で実装する、このコードベース共通のパターン。
metadata:
  type: reference
---

`users/repository.py:UserRepository.create()` が元祖。`walks/repository.py:WalkRepository.create()`（SS-18）が同じ形を踏襲している。

パターン:
1. `with self._db.begin_nested():` の中で `add()` + `flush()`。
2. 競合時（UNIQUE制約違反）は `IntegrityError` を捕捉し、既存行を再取得して返す（`created=False` 相当）。
3. 再取得が `None` になるケース（理論上あり得ないはず）は例外を再送出する（サイレントな不整合よりは 500 の方が安全、という明示コメント付き）。
4. `db.rollback()` ではなく `begin_nested()`（savepoint）を使う理由が両実装ともコメントで明記されている: 素の rollback は呼び出し元が張っている外側トランザクション全体を破壊するため。

**How to apply:** 新しい冪等 INSERT（UNIQUE制約 + 再送耐性）を見たら、このパターンに沿っているか確認する。savepoint を使わず素の `db.rollback()` や `db.commit()` を try/except 内でやっていたら、外側トランザクションを壊すバグとして指摘する。

再送されたペイロードの中身が既存行と食い違っていても検証していない（既存行をそのまま返すだけ）。users/walks 両方でこの前提。意図的なトレードオフとして許容されている模様（クライアントは同じ `client_walk_id` に対して同じ内容を送る前提）。新規ドメインで同パターンを使うときは、内容不一致を握りつぶしてよいかは都度確認する価値がある。
