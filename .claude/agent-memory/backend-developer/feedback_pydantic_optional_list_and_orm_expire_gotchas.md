---
name: feedback-pydantic-optional-list-and-orm-expire-gotchas
description: SkipJsonSchema[None]+max_lengthの罠、commit後のSQLAlchemy属性expireでのテスト罠、サービス直呼びテストでの明示rollbackの必要性。SS-112で発見
metadata:
  type: feedback
  scope: durable
---

SS-112（`PATCH /pins/{pin_id}` 実装）で発見した、繰り返しうる3つの落とし穴。

## 1. `list[X] | SkipJsonSchema[None]` フィールドに `max_length` を付けるときは `Annotated` でリスト側にだけ付ける

`PinCreate.sanpo_map_id` と同じ「省略可・null不可」パターンをリストフィールドに使う場合、
次のように**外側の `Field()` に `max_length` を書くと壊れる**:

```python
# NG: 値が None（明示的なnull）のとき len(None) を試みて TypeError になる
add_tags: list[str] | SkipJsonSchema[None] = Field(default_factory=list, max_length=10)
```

正しくは、制約をリスト型の `Annotated` にだけ付ける:

```python
add_tags: Annotated[list[str], Field(max_length=10)] | SkipJsonSchema[None] = Field(
    default_factory=list
)
```

**Why:** pydantic v2 は `Field(max_length=...)` を union全体の制約として適用するため、値が
`None`（`SkipJsonSchema[None]` 側に一致）でも `max_length` バリデータが呼ばれ、
`len(None)` で `TypeError`（`model_validator` が拾う前に落ちる）になる。

**How to apply:** null許容のoptionalなリスト/文字列フィールドに長さ制約を付けるときは、
常に「制約は非null側の型にAnnotatedで付け、outerのFieldはdefault_factory/defaultだけを
持つ」形にする。既存の`PinCreate.tags`（null許容ではない）は影響を受けない。

## 2. commit後に同じセッションのORMオブジェクトへアクセスすると、削除有無で挙動が変わる

`sessionmaker(...)` の既定 `expire_on_commit=True` が肝。訂正: 当初「主キーは expire
されない」と理解していたが、正確には**「削除されたか persistent のままか」で挙動が違う**
（`backend-code-quality-reviewer` の [[pattern_expired_orm_attr_in_post_commit_log]] で
判明、感謝）。

- **`session.delete(obj)` した対象**: commit 後は expire ではなく **expunge（detach）**
  されるため、`obj.id` のようなメモリ上の値へのアクセスは新規クエリを誘発しない
  （行が実際に無くなっていても、削除した本人のオブジェクトなら安全に読める）。
- **削除していない persistent オブジェクト**（例: `current_user`、あるいは「このピンの
  写真を消したが pin 自体は消していない」場合の `pin`）: commit 後は属性が expire
  され、次のアクセスで再読込の SELECT が飛ぶ。対象行が本当に消えていれば
  `ObjectDeletedError`、消えていなければ「気付きにくい無駄な SELECT」になる。

**How to apply:** commit 後に ORM オブジェクトの属性（ログ出力・アサーション問わず）へ
アクセスしたくなったら、それが「今回のトランザクションで delete() した本人」か
「delete していない persistent オブジェクト」かを区別する。後者なら、commit 前に
必要な値（`s3_key`・`byte_size`・`user_id` など）をローカル変数へ控える、または
既に引数として持っている ID（`pin_id`/`photo_id` パラメータ等）をそのまま使う。
テストでも同じ理由で、検証に使う値は削除メソッドを呼ぶ**前**に控えておく。

## 3. `PinService` を直接呼ぶテストで、例外によるロールバックを検証するときは `db_session.rollback()` を明示する

HTTP経由なら `get_db()` の `finally: db.close()` が未コミットのトランザクションを暗黙に
破棄するが、テストが `service.update_pin()` のようにサービスを直接呼ぶ場合はこの経路を
通らない。`flush()` 済み（例: タグの`add_tags()`）だが未commitの変更は、明示的に
`db_session.rollback()` しない限り**同一トランザクション内では見え続ける**ため、
「例外が出たのでロールバックされているはず」という素朴なアサーションは失敗する
（`pytest.raises(...)` の後に `db_session.rollback()` を呼んでから検証する。
`TestPinServiceObjectStorageFailure`（`pins/tests/test_service.py`）に既存の同パターンあり）。

## 参考: このプロジェクトに mypy は導入されていない

`packages/backend/pyproject.toml`・`docs/toolsets-libraries.md` のいずれにも mypy の記載が
無く、設定ファイルも存在しない。タスク指示に「型チェックを通す」とあっても、実行対象が
無いため `ruff check` / `ruff format --check` / `pytest` のみで足りる（将来 mypy が
導入されたら、このメモは更新すること）。
