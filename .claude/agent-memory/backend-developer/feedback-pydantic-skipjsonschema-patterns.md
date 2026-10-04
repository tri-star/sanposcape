---
name: feedback-pydantic-skipjsonschema-patterns
description: Pydantic v2 で「省略可・明示 null は 422・OpenAPI 上は non-nullable」を表す SkipJsonSchema[None] パターンと、リスト/文字列に max_length を付けるときの罠。backend に mypy は未導入
metadata:
  type: feedback
  scope: durable
---

SS-88（`PinCreate.sanpo_map_id`）と SS-112（`PATCH /pins/{pin_id}` の `add_tags`）で使った・踏んだパターン。

**Why:** 素直に `T | None` と書くと OpenAPI が nullable になり、mobile の Orval 型にも null が漏れる。
一方 SkipJsonSchema を使うと、制約の付け方次第で明示 null が 422 ではなく 500（TypeError）になる。

**How to apply:**

## 1. 省略可・明示 null は 422・OpenAPI 上は non-nullable

`field: T | SkipJsonSchema[None] = None` ＋ `model_validator(mode="after")` で
`"field" in self.model_fields_set and self.field is None` なら `ValueError`。
`model_fields_set` は「リクエスト JSON にそのキーがあったか」を返すので、省略はすり抜け、明示 `null` だけを弾ける。
`SkipJsonSchema` は `pydantic.json_schema` から import する（実例: `sanpo_maps/pins/schemas.py` の `PinCreate`）。

## 2. 長さ制約は非 null 側の型に `Annotated` で付ける

```python
# NG: 値が None のとき len(None) を試みて TypeError（model_validator が拾う前に落ちる）
add_tags: list[str] | SkipJsonSchema[None] = Field(default_factory=list, max_length=10)

# OK
add_tags: Annotated[list[str], Field(max_length=10)] | SkipJsonSchema[None] = Field(
    default_factory=list
)
```

pydantic v2 は外側の `Field(max_length=...)` を union 全体の制約として適用するため。
null 許容の optional なリスト/文字列に長さ制約を付けるときは常に「制約は非 null 側に Annotated、外側の Field は
default/default_factory だけ」にする。

## 参考: backend に mypy は導入されていない

`packages/backend/pyproject.toml` にも `docs/toolsets-libraries.md` にも mypy の記載が無く、設定ファイルも無い。
「型チェックを通す」という指示があっても `ruff check` / `ruff format --check` / `pytest` で足りる
（mypy が導入されたらこの節を更新する）。

関連: [[feedback-boto3-s3-and-pg-advisory-lock-gotchas]]
