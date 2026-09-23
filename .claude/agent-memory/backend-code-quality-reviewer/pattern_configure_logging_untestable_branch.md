---
name: pattern_configure_logging_untestable_branch
description: core/observability.py の configure_logging() は「root/app loggerどちらにもハンドラーが無ければ追加する」分岐（uvicorn/ローカル向け）を持つが、pytestのlogging pluginがrootに常時ハンドラーを付けるため、素朴なテストではこの分岐が一度も実行されない。
metadata:
  type: reference
  scope: durable
---

`packages/backend/src/sanposcape/core/observability.py` の `configure_logging()`（SS-88/SS-106
の可観測性追加、2026-09）:

```python
if not logging.getLogger().handlers and not app_logger.handlers:
    handler = logging.StreamHandler()
    ...
    app_logger.addHandler(handler)
```

- Lambda 向け分岐（root に既にハンドラーがある → 何もしない）は
  `core/tests/test_observability.py::TestConfigureLogging::test_does_not_add_a_handler_when_root_already_has_one`
  でテスト済み。
- しかし **uvicorn/ローカル向けの本来の分岐（root にも app logger にもハンドラーが無い →
  1つ追加する）は、diff時点でテストが無かった**。pytest の logging プラグインは通常セッション中
  root logger に常にハンドラー（`LogCaptureHandler` 相当）を付けているため、素朴に
  `configure_logging()` を呼ぶテストを書いても「何もしない」分岐しか通らず、
  「追加する」分岐・「2回呼んでも増えない」冪等性を検証できない。

**How to apply:** この関数（または同種の「ハンドラーの有無で分岐する」ロギング初期化コード）を
レビューするときは、`root.handlers` / `app_logger.handlers` を明示的に空リストへ退避・復元してから
呼ぶテスト（例: `root.handlers = []; app_logger.handlers = []` を try/finally で囲む）が
存在するか確認する。無ければ、実運用で最も使われる経路（ローカル docker compose の uvicorn）が
実質ノーテストのまま本番相当の Lambda 分岐だけ厚く保護されている、という非対称に気づく。
