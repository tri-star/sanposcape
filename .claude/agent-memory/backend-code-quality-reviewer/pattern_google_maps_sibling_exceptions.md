---
name: pattern_google_maps_sibling_exceptions
description: integrations/google_maps/exceptions.py のGoogleMapsQuotaErrorとGoogleMapsUnavailableErrorは共通の親GoogleMapsErrorを持つだけの兄弟クラスで、継承関係が無い。except節での取りこぼしに注意。
metadata:
  type: reference
  scope: durable
---

`packages/backend/src/sanposcape/integrations/google_maps/exceptions.py`:

```python
class GoogleMapsError(Exception): ...
class GoogleMapsQuotaError(GoogleMapsError): ...
class GoogleMapsUnavailableError(GoogleMapsError): ...
```

`GoogleMapsQuotaError` は `GoogleMapsUnavailableError` のサブクラスではない（逆も同様）。
どちらも `GoogleMapsError` の直接の子。

**Why:** `except GoogleMapsUnavailableError:` だけを書くコードは `GoogleMapsQuotaError`
（429相当）を捕まえず自然に上位へ伝播する。SS-33 の周回リトライループ（`maps/service.py`
`_resolve_loop`）はこれを**意図的に利用**しており、クォータ超過時は経由点を変えて再試行せず
即座に429として mobile へ返す（再試行するとクォータ超過中の状況を悪化させるだけのため）。
テストは `maps/tests/test_service.py::test_get_walking_route_loop_quota_error_short_circuits_without_retrying`。

**How to apply:** `integrations/google_maps/` 周りで新しい `except` 節を見たら、
`GoogleMapsQuotaError` と `GoogleMapsUnavailableError` を両方明示的に扱っているか
（あるいは片方だけ意図的に素通しさせているなら、その意図がコメント/テストで示されているか）
を確認する。`except GoogleMapsError:` のように親クラスでまとめて捕まえている場合は、
429と503を区別する必要がある呼び出し元でないか注意する。
