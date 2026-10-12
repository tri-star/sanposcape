---
name: api-contract-and-openapi
description: OpenAPI に出る形の作り方（SkipJsonSchema[None] で「省略可・明示 null は 422・non-nullable」、長さ制約は非 null 側に Annotated で付ける）と、openapi.yaml 再出力の差分の読み方（json は gitignore、docstring でも差分、差分ゼロが正常なケース、契約テストは存在チェックのみ）
metadata:
  type: feedback
  scope: durable
---

`openapi.yaml` は mobile の Orval が読む API 契約。変更すると mobile CI が走る（`packages/backend/docs/local-env.md`「OpenAPI 定義」）。

## 1. 省略可・明示 null は 422・OpenAPI 上は non-nullable（SkipJsonSchema）

**Why:** 素直に `T | None` と書くと OpenAPI が nullable になり、mobile の Orval 型にも null が漏れる。一方 `SkipJsonSchema` を使うと、
制約の付け方次第で明示 null が 422 ではなく 500（TypeError）になる（SS-88 の `PinCreate.sanpo_map_id`、SS-112 の `add_tags`）。

**How to apply:**
- `field: T | SkipJsonSchema[None] = None` ＋ `model_validator(mode="after")` で `"field" in self.model_fields_set and self.field is None` なら `ValueError`。
  `model_fields_set` は「リクエスト JSON にそのキーがあったか」を返すので、省略はすり抜け、明示 `null` だけを弾ける。
  `SkipJsonSchema` は `pydantic.json_schema` から import する（実例: `sanpo_maps/pins/schemas.py` の `PinCreate`）。
- 長さ制約は**非 null 側の型に `Annotated` で付け**、外側の `Field` は default / default_factory だけにする。pydantic v2 は外側の
  `Field(max_length=...)` を union 全体に適用するので、None のとき `len(None)` で TypeError になる。

```python
# NG
add_tags: list[str] | SkipJsonSchema[None] = Field(default_factory=list, max_length=10)
# OK
add_tags: Annotated[list[str], Field(max_length=10)] | SkipJsonSchema[None] = Field(default_factory=list)
```

## 2. `export_openapi.py` の再出力で差分が出る・出ないの判断材料

**Why:** 差分ゼロを見て生成失敗を疑ったり、「API を変えていないのに差分が出た」と戸惑ったりして時間を使った（SS-18・SS-53・SS-111）。

**How to apply:**
- `packages/backend/openapi.json` は gitignore 対象。`git diff packages/backend/openapi.yaml` だけを見ればよい。
- router・schema の **docstring や説明文が description の生成元**なので、docstring を直しただけでも yaml に差分が出る（ファイル移動のついでに
  docstring を直すと mobile CI が走る。[[module-relocation]]）。
- 差分ゼロが正常なケース: `datetime` → `pydantic.AwareDatetime`（どちらも `type: string, format: date-time`）、ロジック不変のコード移動。
- OpenAPI 契約テストは特定レスポンスコードの「存在」（`"401" in operation["responses"]`）しか見ていない（`walks/tests/test_router.py` など）。
  「このコードは含まれない」を保証したいなら明示的なテストを別に足す。
