---
name: project_ss98_feature_flag_decisions
description: SS-98 のプランで決めたフィーチャーフラグ基盤の設計判断（ダークローンチ不採用 / kill switch は環境変数のまま / 公開可否はコード所有 / /app-config のスキーマ）。ADR-008 追補が入るまでの暫定記録
metadata:
  type: project
  scope: task-local
  source_issue: SS-98
---

SS-98（backend の AppConfig フラグ基盤 + `GET /app-config`）のプラン作成時（2026-09-20）に決めた事項。
**ADR-008 への追補が入った時点でこのメモは削除する**（正本は ADR）。

- **`/app-config` のレスポンス**: `flags`(`dict[str,bool]`、クライアント公開可のみ) +
  `minimum_supported_versions.{ios,android}`(`"X.Y.Z"` または `null`。**null = 強制アップデートしない**) +
  `config_source`(`appconfig`/`default`/`stub`、診断用)。未認証で叩ける。`Cache-Control: no-store`。
  `flags` を固定キーのオブジェクトにしないのは、フラグ削除（ADR-008 決定6）が
  毎回 API の破壊的変更になるのを避けるため。
- **ダークローンチ（ユーザー条件付きフラグ）は不採用**。決め手は「`/app-config` は未認証で
  叩ける必要がある」こと（採ると mobile がサインイン前後で 2 回取得する実装になる）。
  将来のために `is_enabled(key)` は後から `*, context=...` を足せる形にする。
- **`GOOGLE_MAPS_LOOP_ROUTE_ENABLED` は AppConfig へ移行しない**（ADR-008 の宿題への回答）。
  一般規則として書き下した: **未公開機能の公開制御（安全側 OFF）→ AppConfig /
  公開済み機能の緊急停止（安全側 ON）→ 環境変数**。AppConfig の既定は全 OFF なので、
  安全側が ON のフラグを載せると「読めない → 公開済み機能が劣化する」経路が増える。
- **フラグの「クライアント公開可否」は backend のコード（登録簿）が所有する**。
  AppConfig の JSON は `additionalProperties: false` で独自メタ情報を置けず、
  値の切替操作で内部専用フラグが露出する事故を防ぐため。値（ON/OFF）だけが AppConfig 所有。
- **モード切替は `FEATURE_FLAG_MODE=real|stub`**（既定 real）+ `APPCONFIG_*` の ID が 1 本でも
  空なら `UnconfiguredFlagSource`（AWS を呼ばない）。この構造により
  **CI ワークフローと既存開発者の `.env` は無変更で安全**（`MAPS_MODE` と同じ型）。

**Why:** ADR-008 は「レスポンススキーマとダークローンチの要否は SS-98 で決める」として
意図的に空欄にしており、この 5 点が SS-98 の成果物としてそこへ追補される予定。

**How to apply:** SS-99 / SS-100 / SS-101 のプランを書くときはこの前提を再検討せず使う。
ADR-008 に追補済みなら ADR を読むこと（こちらは削除されているはず）。
