---
name: backend-concurrency-and-locking
description: backend の並行性・ロック・時間予算のレビュー観点。プランの並行性設計を実装の分岐と1行ずつ突き合わせる、同時2重 DELETE の SAWarning、「ちょうど1つ」の不変条件の0になる方向、タイムアウトガードの非対称、締め切りの非対称
metadata:
  type: feedback
  scope: durable
---

逐次実行のテストが通っていることと、並行実行で不変条件が崩れないことは別の観点。ここに挙げたものはどれも、テスト網羅を確認して OK とした後に
外部レビューや本番相当の条件で見つかった。

## 1. プランの並行性・冪等性の設計を、実装の分岐と箇条書き単位で突き合わせる

SS-88 で、プランが設計した「真に同時なリトライで枠が既に attached なら同じ冪等ターゲットへの再送として成功扱い」が、`create_pin` と
`add_photos` で共有するヘルパー（`_prepare_photos`）に無く、`add_photos` 側の事前チェックにしか無かった（2回目が 409 になっていた）。

**Why:** 実装は一見それらしいコード（状態チェック、409 の分岐）を書いているので不自然に見えない。冪等性のテストは逐次リトライだけになりがち。
共有ヘルパーの呼び出し元の片方だけがテストされていることがある。

**How to apply:**
- 冪等キー（`client_*_id`）・advisory lock・`FOR UPDATE`・確定処理を含む変更では、プランや ADR の該当箇所を箇条書き単位で実装の行と突き合わせ、
  「この設計判断はどのファイルのどの分岐で実現されているか」を1つずつ指させないなら実装漏れを疑う。
- 共有ヘルパーは、呼び出し元 A のテストだけで B も安全と判断しない。
- 「真に同時なリクエスト」を再現するテストが無いこと自体を指摘してよい（threading + 別 Session の手法は backend/sqlalchemy-and-db）。

## 2. select → `session.delete()` → flush の物理削除は、同時2重 DELETE で誤成功しうる

後発の DELETE は先発の commit まで行ロックで待ち、再開時には0行になる。モデルに `version_id_col` が無いと SQLAlchemy はこれを
`StaleDataError` ではなく `SAWarning` でしか報告せず、`flush()` は成功に見えて `delete()` が `True` を返す（ADR-003 の「2回目の DELETE は 404」に反する）。

**How to apply:** 新しい `repository.delete()` を見たら、
- 呼び出し元が成否を区別する（404 など）なら、walks（`WalkRepository.delete()`）と同じく flush の間だけ `SAWarning` を例外に昇格させて捕捉しているか。
  `StaleDataError` だけを捕まえていても `version_id_col` 無しでは何も捕まらない。
- 区別しないなら、users（`UserRepository.delete()`）のように docstring に未対応の理由があるか。users 側は意図的な未対応なので再指摘しない。
- 指摘には「モバイルは再送しやすい通信環境」という文脈を添える。

## 3. 「ちょうど1つ」の不変条件は、増える方向と0になる方向を分けて見る

SS-113 で、既定地図（owner ごとにちょうど1つ）が同じ owner の `create_map`/`delete_map` の同時実行で崩れる穴を見逃した（PR #103 の外部レビューで発覚）。
部分一意インデックスは「2つになる」は防げるが「0になる」は防げない。`promote_latest_to_default()` の UPDATE が rowcount を見ていなかった。
対応（owner 単位の advisory lock）と決定は ADR-009 決定27 の追補。

**How to apply:** `is_default` のような列を書くメソッドでは、
- 一意制約で防げない方向に直列化（advisory lock・`FOR UPDATE`）があるか。判定の SELECT から書き込み・commit までがロックの内側か。
- `UPDATE`/`DELETE` の rowcount を見ずに成功扱いしていないか。

## 4. タイムアウト・ロックのガードを一部の操作にだけ足していないか

SS-141 で `_delete_all()`（DML）にだけ `lock_timeout` を足し、同じファイルの `drop_all`/`create_all`（DDL。より広く衝突する）に無かった
（同じ PR で解消。ADR-B-001 決定1・決定4）。

**How to apply:** 明示的なタイムアウトやロックのガードを足す変更では、同じファイル・同じ関心事の中に同種のロックを要求する操作が無いかを見て、
ガードの有無が一貫しているかを確かめる。「頻度が低いから」はガードを省く理由にならない（1回のハングで全体が止まる方が重い）。

## 5. 締め切り（deadline）が一部のフェーズにしか掛かっていない／呼ぶ前だけ確認している

`deadline_seconds`/`monotonic` の時間予算は、Lambda の29秒に強制終了される前に制御された応答（503/204）を返すためのもの。繰り返し見つかった非対称は2種類:
1. 締め切りが最初のフェーズにしか掛かっていない（SS-88 の `PhotoAttacher`。今は3フェーズとも同じ `deadline_at`）。
2. 呼ぶ前だけ確認し、呼び出し中の時間が予算に入っていない（SS-112。削除経路は専用 client と起動時検証で解消）。
   **確定処理の「呼ぶ前だけ」は ADR-009 決定22 の 2026-09-26 追補で受容済み**なので再指摘しない。

**How to apply:**
- すべてのネットワーク I/O フェーズ（特に応答直前まで続く書き込み・削除）が同じ締め切りの傘下にあるか。
- 呼ぶ前だけの判定なら、1回の最悪時間（timeout × 試行回数）が予算に収まる設計か（見積もり方は backend/aws-and-external-calls）。
- 時間予算の計算が他モジュールの定数（例: `integrations/aws/s3.py` の `_DELETE_TOTAL_MAX_ATTEMPTS`）を前提にしているなら、その前提をテストで固定しているか
  （`integrations/aws/tests/test_s3.py::test_delete_total_max_attempts_is_one`）。

関連: [[backend-code-quality]]
