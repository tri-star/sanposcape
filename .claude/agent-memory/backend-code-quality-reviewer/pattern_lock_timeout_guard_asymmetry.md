---
name: pattern_lock_timeout_guard_asymmetry
description: DB操作に明示的なlock_timeout/statement_timeoutガードを足すとき、同じファイル内の他のDB操作（特に頻度は低いが影響範囲が広いもの）にも同じガードが要るか必ず確認する
metadata:
  type: feedback
  scope: durable
---

`packages/backend/src/sanposcape/conftest.py` の `_delete_all()`（SS-141, ADR-B-001）は
「閉じ忘れた接続が idle in transaction で残っているとDMLが無言で止まりうる」ことを理由に
`SET LOCAL lock_timeout='10s'` を明示設定した。しかし同じファイル内の `_setup_test_db_schema()`
の `Base.metadata.drop_all`/`create_all`（DDL、ACCESS EXCLUSIVE相当でより広く衝突しうる）
には同種のガードが無い。docstringは「今のdrop_allも同じリスクだが新しいリスクではない」と
認めた上で意図的にスコープ外にしていたが、レビューでは「頻度は低い（セッションに1回ずつ）
が、ハングした場合の影響範囲はテストスイート全体」という非対称性を🟡 Importantとして
指摘した（SS-141, 2026-09-29）。
この指摘は同じ PR 内で対応済みで、現在は `_setup_test_db_schema` も同じ `_LOCK_TIMEOUT` を
使っている。

**Why**: 診断可能性を高めるガードを一部の操作にだけ足すと、「なぜあちらには足したのに
こちらには足していないのか」という疑問符が残り、かつ影響範囲が広い方を無防備にしたまま
になりがち。頻度の低さは「後回しにしてよい」根拠にはならず、むしろ「1回のハングで
全体が止まる」ことを考えると優先度は下がらない。

**How to apply**: DBに対して明示的なタイムアウト/ロックガードを追加する変更をレビューする
ときは、同じファイル・同じ関心事（例: `test_engine` を直接操作するfixture群）の中で
他に同種のロックを要求する操作が無いか確認し、ガードの有無が一貫しているかを必ずチェックする。
DDL（drop_all/create_all/TRUNCATE等）はDML（DELETE等）よりロック競合の影響範囲が広い
傾向があるため、「頻度が低いから」という理由だけでガード省略を正当化しない。この観点は
`conftest.py` に限らず、明示的なタイムアウト設定を一部の関数にだけ追加するあらゆる
レビューで再利用できる。
