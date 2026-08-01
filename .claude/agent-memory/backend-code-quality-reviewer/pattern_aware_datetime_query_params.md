---
name: pattern_aware_datetime_query_params
description: リクエストボディのdatetimeはAwareDatetimeでtz-aware必須にしているが、クエリパラメータのdatetimeでは素のdatetime型になっていて非対称になりがちな箇所。
metadata:
  type: feedback
---

SS-18 (`walks/router.py`) で発見: `WalkCreate.started_at` / `ended_at` は `pydantic.AwareDatetime` で naive datetime を 422 で弾いているのに対し、`GET /walks` の `started_after` / `started_before` クエリパラメータ（`walks/router.py`）は素の `datetime | None = Query(default=None)` で、naive な日時文字列も通ってしまう。

DBカラム（`Walk.started_at` = `DateTime(timezone=True)`）は tz-aware 前提。naive datetime がフィルタ条件に渡ると、Postgres 側でセッションのタイムゾーン設定に依存した解釈になり、`started_after`/`started_before` の半開区間フィルタ（週/月チャート用途で重要、D5）が呼び出し元の意図とズレる可能性がある。テストもこのケース（naive な `started_after`）をカバーしていなかった。

**Why:** ボディ側で確立した「tz-aware必須」の規律がクエリパラメータには波及していない。片方だけ厳格でもう片方が緩いと、境界日時のフィルタ結果が実行環境のタイムゾーン設定に静かに依存するバグを生みやすい。

**How to apply:** 新しいエンドポイントで日時をクエリパラメータとして受け取る箇所を見たら、`AwareDatetime` (もしくは同等の tz-aware 強制) を使っているか確認する。素の `datetime` 型を見たら、DBカラムが `timezone=True` かどうかとセットでチェックし、非対称なら指摘する。
