---
name: observability
description: ログ・トレースを触るときの罠。OTel 計装を足したら実起動で DB ルートを叩く、テストで DB URL は test_engine.url、文脈つきログは caplog でなく json_logs、例外メッセージ非出力テストにリテラルを書かない、識別子を足すときはプライバシー申告と照合する
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-04-30
---

方針・構成の正本は ADR-013（`docs/adr/ADR-013-observability-adot-application-signals.md`）と deployment.md §13〜§16。ここには実装・テストで踏みやすい罠だけを置く。

## 1. 計装を足したら、実起動して実際に DB へ届くルートを叩く

**Why:** SS-178 で、SQLAlchemy の計装が `instrument()` の中で `sqlalchemy.ext.asyncio` を import し、greenlet が無いと `get_engine()` が落ちて
DB を使う全ルートが 500 になった（今は `sqlalchemy[asyncio]` を runtime 依存にしてある）。DB 無しの単体テストでは検出できず、
`opentelemetry-instrument` でローカル起動して DB ルートを叩いて初めて発覚した。

**How to apply:**
- 計装を足したら「実起動 + DB へ届くルート」を1回叩く。計装関数は例外を握って WARNING に倒し、トレースでアプリを落とさない。
- テスト内で `Settings()` から DB の URL を組み立てない。conftest の環境変数の隔離で既定値（host=db）になり、CI（DB_HOST=localhost）だけで落ちる。`test_engine.url` を使う。
- `pytest --noconftest` で DB 不要のテストだけ回せる（conftest の session autouse が DB を要求するため）。DB 込みの全体実行の代わりにはならない。
- sandbox からは docker の公開ポートへ接続できない。OTLP の受信は sandbox 内に立てた自前の HTTP サーバーで確認する。

## 2. ログの文脈（LogContext・trace_id）のテスト

文脈は format の時点で読む（ADR-013 決定3 の SS-180 追補「制約」）ので、`caplog` の LogRecord を後から format しても文脈は消えている（SS-180 で詰まりかけた）。

**How to apply:**
- conftest の `json_logs` fixture（emit 時に `JsonLogFormatter` で dict にする）を使う。
- 「例外メッセージがログに出ない」テストでは、メッセージをソースにリテラルで書かない（`raise X("secret")` の行がスタックトレースの source 行として出力に入る）。実行時に組み立てる。
- ambient な `main.app` は `ENV=local` なのでメッセージ出力が ON。`JsonLogFormatter` のテストは fixture で安全側（False）に揃える。conftest の autouse
  `_restore_log_options` が戻す。monkeypatch の対象は実体の `sanposcape.core.logs` で、ファサードの `core/observability.py` ではない。
- Python の traceback は同じフレームの繰り返しを畳むので、行数上限のテストは再帰ではなく上限定数を monkeypatch する。

## 3. ログ・スパンに識別子を足すときはプライバシー申告と照合する

**Why:** SS-181 の時点で `docs/app-privacy-label.md` に「トレースはユーザ ID も持たない」と書いてあり、スパンに `enduser.id` を足すと記述が偽になった
（申告の回答自体は既に「紐づく」で変わらなかった）。

**How to apply:** ユーザー ID・セッション ID などをログやスパンに足すプランでは、`docs/app-privacy-label.md` の根拠の記述と LP のプライバシーポリシー
（1-5）を見て、直す箇所を作業に入れる。

関連: [[testing]]
