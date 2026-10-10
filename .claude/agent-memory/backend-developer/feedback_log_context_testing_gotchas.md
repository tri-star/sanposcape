---
name: feedback-log-context-testing-gotchas
description: ログの文脈(ContextVar/current span)のテスト罠 — caplogでは取れない、例外メッセージ非出力テストにソースのリテラルを書かない、ambient main.appはメッセージ出力ON（SS-180）
metadata:
  type: feedback
  scope: durable
---

文脈つきのログ(`LogContext`・trace_id)は format 時点で読むため、`caplog` で後から見ても空。conftest の `json_logs` fixture(emit 時に JsonLogFormatter で dict 化)を使う。

**Why:** SS-180 で caplog の LogRecord を後から format して文脈が無く詰まりかけた。
**How to apply:**
- 「例外メッセージがログに出ない」テストでは、メッセージをソースにリテラルで書かない(`raise X("secret")` の行がスタックトレースの source 行として出力に入る)。実行時に組み立てる。
- ambient な `main.app` は ENV=local なので `_LOG_OPTIONS.include_exception_messages=True`。JsonLogFormatter のテストは fixture で安全側(False)に揃える。conftest の autouse `_restore_log_options` が復元する。
- Python の traceback は同一フレームの繰り返しを畳むので、行数上限のテストは再帰ではなく上限定数を monkeypatch する。
