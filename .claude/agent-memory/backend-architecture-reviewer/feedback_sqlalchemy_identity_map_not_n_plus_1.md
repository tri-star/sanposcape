---
name: feedback_sqlalchemy_identity_map_not_n_plus_1
description: SQLAlchemy Session.get()が直前のselect()と同じPKを再取得するように見えても、identity mapキャッシュにより追加クエリは発行されない
metadata:
  type: feedback
  scope: durable
---

SS-111（`pins/service.py::get_pin()`）で、`PinRepository.get_for_member()`（`select(Pin, SanpoMapMember.role)...`で認可チェック）の直後に `_require_read_model()` が `PinRepository.load_read_model()` 経由で `self._db.get(Pin, pin_id)` を呼んでいる。一見「同じ行を2回SELECTしている（軽微なN+1/冗長クエリ）」ように見えるが、`Session.get()` は同一セッションのidentity mapを先にチェックするため、直前の `select(Pin, ...)` で既にPin ORMインスタンスがidentity mapに載っていれば追加SQLは発行されない。

**Why:** 「認可チェック用の取得」と「本体データ取得用の取得」が別メソッド呼び出しになっているレイヤー設計（`pins/`ドメインの規約: 認可はJOINで絞った取得、本体組み立ては別途`load_read_model()`）は、一見非効率に見えて実際はSQLAlchemyのセッションレベルキャッシュで吸収される設計になっている。

**How to apply:** 同一トランザクション内で「同じPKへの`db.get()`/`select()`が2回ある」ように見えても、間に`populate_existing()`や別セッションの使用がなければ、2回目はDBラウンドトリップが発生しない可能性が高い。指摘前に「本当に2クエリ発行されるか」をテストのSQLログ等で確認するか、少なくとも指摘の重要度をLow/Suggestionに留める。真のN+1（ループ内でのクエリ発行）と混同しないこと。
