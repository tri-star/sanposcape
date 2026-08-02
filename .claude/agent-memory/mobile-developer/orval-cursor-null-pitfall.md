---
name: orval-cursor-null-pitfall
description: Orval-generated URL builders stringify null query params as the literal "null", breaking cursor-based pagination
metadata:
  type: feedback
---

Orval's generated `get<Xxx>Url(params)` helpers build query strings with:

```js
if (value !== undefined) {
  normalizedParams.append(key, value === null ? 'null' : String(value))
}
```

So passing `{ cursor: null }` into a generated params type produces `?cursor=null` (the literal
3-character string), not "no cursor param". For `GET /walks` this makes the backend return
400 Invalid cursor.

**Why:** discovered while building `features/history/lib/walkHistoryParams.ts`
(`buildWalkListParams`) in SS-20 — the plan explicitly called this out as a known trap.

**How to apply:** whenever building params for an Orval-generated endpoint that accepts an
optional/nullable field (cursor, filter, etc.), write a small param-builder function that
only sets the key when the value is a non-empty, meaningful value, and otherwise leaves the
key absent (`undefined`, not `null`). Test this explicitly: `expect("cursor" in params).toBe(false)`
for null/undefined/empty-string input.
