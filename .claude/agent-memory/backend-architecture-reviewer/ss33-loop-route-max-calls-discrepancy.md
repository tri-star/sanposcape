---
name: ss33-loop-route-max-calls-discrepancy
description: SS-33周回ルートのGoogle呼び出し回数が「最大2回」の記述と実装(最大3回)で食い違っている件
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

SS-33（周回ルート `POST /explore/routes/walking`）の `maps/service.py::_resolve_loop()` は、
経由点の右→左2回の試行が**両方とも例外（`GoogleMapsUnavailableError`）または空応答で失敗した場合のみ**、
3回目として `intermediates` なしの素の片道呼び出しにフォールバックする。これは実装・テスト
（`maps/tests/test_service.py` の
`test_get_walking_route_loop_falls_back_to_plain_call_when_both_waypoints_error` /
`test_get_walking_route_loop_raises_unavailable_when_no_attempt_ever_succeeds`）が
`len(provider.calls) == 3` を明示的に assert しており、意図した設計。

一方で `docs/adr/ADR-001-map-poi-google-maps-platform.md`（SS-33追補、118行目付近）は
「周回1ルートあたりの Google 呼び出しは最大2回（経由点の右→左の再試行）に収まる設計にした」と明記しており、
`config.py` の `google_maps_route_deadline_seconds` のコメントも「最大2回の Google 呼び出しを含む」としている。
バックエンド実装計画（決定6・リスク表・完了条件チェックリスト）も同様に「最大2回」と繰り返している。

**Why:** 少なくとも1回の試行が使える応答（品質不採用でも legs が返る場合を含む）を得られれば
2回で収まるが、両方とも例外・空応答（Google障害や極端に悪い経由点位置）だった場合のみ3回目が発生する。
「最大2回」は要約レベルの記述であり、詳細な設計判断（例外時のみ3回目に言及）と矛盾したまま
ADR まで転記されてしまった。billing/quota のリスク評価に使われる数値なので、
ADR・config コメントが実態と異なる点は指摘する価値がある。

**How to apply:** このチケット(SS-33)のPRレビューで「Google呼び出しが最大2回に収まっているか」を
確認する際は、実装(3回になり得る)とドキュメント(2回と主張)の不一致を Medium severityで指摘してよい。
これは実装バグではなくドキュメント/要約文の不整合なので、「実装を直せ」ではなく
「ADR-001・config.py のコメントを『最大3回（経由点2回+最終フォールバック1回）』に
修正するか、3回目のフォールバック呼び出し自体をやめるかを判断してほしい」という指摘にする。
既にテストで固定された意図的挙動なので、実装側を「バグ」として断定しないこと。
このチケットの対応（ADR修正 or 実装変更）が決着したら、knowledge-harvest スキルで
恒久メモリ化するか削除するか判断すること（現時点では未解決のため task-local）。
