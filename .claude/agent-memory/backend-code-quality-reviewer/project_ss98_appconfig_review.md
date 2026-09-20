---
name: project_ss98_appconfig_review
description: SS-98 AppConfigフィーチャーフラグ基盤レビュー(2026-09-20)の指摘事項。KeyError未捕捉とUnconfigured時のERRORログレベルの2点。SS-99/100/101で取得層を触るときは再確認する
metadata:
  type: project
  scope: task-local
  source_issue: SS-98
---

`integrations/aws/appconfig.py`（`AppConfigFlagSource`）と `core/feature_flags.py` のレビュー結果。
実装全体は事前プランに忠実で、AWS AppConfig 特有の罠
（トークン1回限り・空ボディ・未配信・BadRequestException 再試行）は正しく実装され、
テストも botocore.stub.Stubber によるパラメータ名固定を含め分岐網羅が良い。

**指摘1（Medium）**: `_fetch_once()`（appconfig.py 167-201行）は
`session["InitialConfigurationToken"]` / `response["NextPollConfigurationToken"]` /
`response["Configuration"]` を素の `[]` アクセスしているが、`_refresh()`（147-165行）が
捕捉するのは `ClientError` / `BotoCoreError` / `ValueError` のみで `KeyError` を含まない。
AWS の応答契約上は起きない想定だが、`get_document()` のdocstringは「絶対に例外を
送出しない」と明言しており、破れると `/app-config` が 500 になる（この基盤の存在意義に反する）。
**同じリポジトリの `integrations/google_maps/client.py:355`
`except (KeyError, TypeError, ValueError)` が外部APIレスポンスをパースする際の
確立された流儀**なので、`_refresh()` の catch にも `KeyError` を足すのが一貫性がある。

**指摘2（Medium）**: `build_flag_document_source()`（appconfig.py 218-228行）は
ID未設定時に `logger.error("APPCONFIG_* is not configured; all feature flags are OFF.")`
を出すが、これは **CI・既存開発者の`.env`で最も起きやすい状態**（`test_router.py` の
`unconfigured_client` fixtureのdocstringが明言）。同じ「未設定→安全なフォールバック」でも
`build_google_maps_provider()`（google_maps/client.py 493-494行）は
`UnconfiguredGoogleMapsProvider` に落ちる際 **ログを一切出さない**という先例があり、
一貫性がない。ERROR は「本物の障害」に予約する設計方針（このタスク自身が
`_logged_not_yet_deployed` で徹底しているINFO/ERRORの使い分け）と矛盾しており、
prod のSSM未整備期間やCI実行のたびにERRORが積み上がる。WARNING への格下げ、
または `settings.env not in ("local", "test")` でのみERROR、を推奨。

**良かった実装（踏襲すべきパターン）**:
- `now: Callable[[], float] = monotonic` によるクロック注入（壁時計の巻き戻しに免疫）。
- 「未配信は通常経路」を `_logged_not_yet_deployed` フラグで1回だけINFOに抑制し、
  本物の障害(ERROR)と分離している。
- `BadRequestException`（トークン期限切れ）→ セッション張り直し→1回だけ再試行、
  それ以上は無限ループにならない設計。
- テストが手書きフェイク(分岐網羅用)とStubber(パラメータ名固定用)を使い分けている
  （実API相違はStubberでしか検出できないという明確な理由付き）。

**Why:** SS-99（フラグ切替ワークフロー）・SS-100/101（mobile消費）でこの取得層を
拡張・参照する際、上記2点が未修正なら踏襲しないよう確認する。

**How to apply:** SS-99以降でこのファイルに変更が入ったら、上記2点が直っているか
（`KeyError`捕捉・ERRORログの条件分岐）を最初に確認する。直っていれば本メモは削除してよい。
