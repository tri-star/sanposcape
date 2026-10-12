---
name: sqlalchemy-and-db
description: SQLAlchemy のセッションまわりでテストが嘘をつく罠（identity map・commit 後の expire・直呼びの rollback）、threading + 別 Session で真の行ロック競合を再現する手順、親の付け替えとキー収集→CASCADE 削除の競合、ローカル PG の collation がバイト順
metadata:
  type: feedback
  scope: durable
---

SS-88・SS-112・SS-113・SS-136・SS-175 で踏んだ、DB まわりの「テストが通る／落ちる理由が実装と無関係」になる罠と、設計時の競合の型。

**Why:** どれも本番の挙動ではなくテスト側のセッション管理や DB イメージの性質が原因で、緑のテストが回帰を見逃したり、
赤のテストが存在しないバグを指したりする。逐次実行の TestClient では並行性の穴も見えない。

## 1. HTTP 経由の削除を `db_session.get()` で確認しない

router のテスト（`override_get_db` で別セッションを使う TestClient）で DELETE を叩いた後、読み込み済みの `db_session` に
`.get(Model, id)` すると、identity map のキャッシュが返って `is None` が失敗するか、`expire_all()` を挟むと `ObjectDeletedError` になる。

**How to apply:** `sanposcape.conftest.TestSessionLocal()` で新しいセッションを開いて `.get()` する（使い終わったら `close()`）。
集計 SELECT（`sum_attached_bytes()` など）は identity map を経由しないので罠に当たらない。

## 2. commit 後の ORM 属性アクセスは「delete した本人か」で挙動が違う

既定の `expire_on_commit=True` のもとで、`session.delete(obj)` した対象は commit 後に expunge され、`obj.id` は新規クエリ無しで読める。
delete していない persistent オブジェクト（`current_user`、写真だけ消した `pin` など）は expire され、次のアクセスで SELECT が飛ぶ
（行が消えていれば `ObjectDeletedError`、残っていれば気付きにくい無駄な SELECT）。

**How to apply:** commit 後に使う値（`s3_key`・`byte_size`・`user_id` など）は commit 前にローカル変数へ控える。テストでも、検証に使う値は
削除メソッドを呼ぶ前に控える。

## 3. サービスを直接呼ぶテストで例外後のロールバックを検証するときは `db_session.rollback()` を明示する

HTTP 経由なら `get_db()` の `finally: db.close()` が未コミット分を暗黙に破棄するが、サービス直呼びでは通らない。`flush()` 済み・未 commit の
変更は同一トランザクション内で見え続けるので、`pytest.raises(...)` の後に `db_session.rollback()` してから検証する
（例: `sanpo_maps/pins/tests/test_service.py` の `TestPinServiceObjectStorageFailure`）。

## 4. 真に同時なリクエストの行ロック競合を再現する（threading + 別 Session）

「相手の行ロックで待たされ、解放後に再確認したら状態が変わっていた」は単一セッションの逐次呼び出しでは再現できない。
モックで済ませると、到達しないフォールバック処理を書いてしまう。

**How to apply:**
- holder / waiter にそれぞれ `TestSessionLocal()` の別 Session（＝別コネクション）を割り当て、`threading.Event` で holder をロック取得直後に止める。
- **waiter が実際にロック待ちに入ったことは、固定の `time.sleep()` ではなく `pg_stat_activity` の `wait_event_type = 'Lock'` を
  ポーリングして確かめてから** holder を進める（遅い CI で sleep が足りず偽陰性になるため。お手本は
  `sanpo_maps/maps/tests/test_delete_map_concurrency.py`、ADR-009 決定33）。古いテスト（`walks/tests/test_repository.py` など）は
  `time.sleep(0.3)` のままなので、新しく書くときに写さない。
- **ORM オブジェクトをスレッド間で共有しない。** UUID などのプリミティブだけを渡し、各スレッドで `session.get(User, user_id)` し直す
  （メインスレッドの `User` を渡すと commit 後の expire で元の `db_session` へ暗黙の SELECT が飛ぶ）。
- holder 側で「確定直前」を模すなら、S3 I/O を経由せず `PinRepository.add_photos()` にテスト用の `PreparedPhoto` を直接渡せば足りる。
- Core の `update()` 文（`mark_attached()` 等）は identity map と同期しない。途中で Core update を挟むなら、返す直前に `db_session.refresh(obj)` する。
- 修正前のコードで再現テストが落ちることを確かめる。

## 5. 親の付け替えを足すときは、親の削除が子をロックせずにキーを集めていないか見る

SS-175（ピンの地図移動）で見つけた競合の型。地図削除が「地図行 FOR UPDATE → 写真キーを収集（ピン行はロックしない）→ CASCADE → commit →
S3 削除」の順だったため、同時にピンを別の地図へ移す UPDATE が走ると、ピンは移動先で生き残るのに写真の実体だけが S3 から消える。
付け替えという操作が無かったころは「収集した時点の子 = CASCADE で消える子」が成り立っていて、操作を足した途端に前提が黙って崩れる。
具体的な対処とデッドロックの分析は ADR-009 決定33。

**How to apply:**
- FK の付け替えを足すときは、旧親・新親それぞれの削除経路を読み、キー収集の前に子の行をロックしているかを確認する。対処は
  「削除側で収集の前に子を `FOR UPDATE`」が単純。新しい親は `FOR KEY SHARE` で取ると、削除とだけ衝突し、削除が先なら 404 にできる。
- ロックの取得順を経路ごとに列挙し、循環しないことを書く。**同じ値を送る no-op（新親 = 今の親）も経路として列挙する**
  （SS-175 ではここで「子 FOR UPDATE → 親 KEY SHARE 待ち」と削除側が循環した。同じ親ならロックを取らず手元の role で判定する）。
- READ COMMITTED の再評価で `JOIN ... FOR UPDATE OF 子` が「見つからない」になる副作用は、既知の限界として ADR に書く。

## 6. ローカル/CI の DB は collation が実質バイト順

`compose.yaml` と CI の db は `postgres:17-alpine`（musl）。既定 collation は `en_US.utf8` を名乗るが、比較は実質コードポイント順になる。
glibc 系の PostgreSQL（RDS・Neon など）では大文字小文字・記号・かなの順序が変わる。SS-136 で `.collate("C")` を外しても並び順テストが
ローカルで通ってしまい、テストが回帰を検出できないと判明した。

**How to apply:** API 契約として決定的にしたい文字列ソート（タイブレーク等）は `Column.collate("C")` を明示し、ADR にも「バイト順（COLLATE "C"）」と書く
（前例: ADR-009 のタグ一覧）。「collation を外すと落ちる」違反注入はこの環境では成立しない前提で報告する。

関連: [[testing]] [[planning-checklist]]
