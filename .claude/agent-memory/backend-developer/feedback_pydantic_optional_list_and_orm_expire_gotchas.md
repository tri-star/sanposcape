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

## 2. サービス層の単体テストで、commit後に同じORMオブジェクトの非PK列へアクセスするとObjectDeletedError

`sessionmaker(...)` の既定 `expire_on_commit=True` により、`db.commit()` の後は
セッション内の全ロード済みインスタンスの属性が expire される。テストが `PinService` と
同じ `db_session` を共有していて、サービス内の delete 処理が commit した**後**に、
テストが同じ行の（削除された）ORMオブジェクトの非PK列（`s3_key`など）へアクセスすると、
`sqlalchemy.orm.exc.ObjectDeletedError` になる（`id` などの主キーは expire されないので
アクセスできる——`state.key` が別に保持されているため）。

**How to apply:** service呼び出しで対象行が削除されるテストでは、削除メソッドを呼ぶ**前**に
検証に使う非PK値（`s3_key`、`thumbnail_s3_key`、`byte_size`など）をローカル変数へ控えておく。

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
