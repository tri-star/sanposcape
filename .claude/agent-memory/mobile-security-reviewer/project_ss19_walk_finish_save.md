---
name: project_ss19_walk_finish_save
description: 散歩記録の保存(POST /walks)系を触るPRのレビュー観点。冪等キーの強度判定は一意制約のスコープを実コードで確かめる教訓、軌跡送信整形の定数同期、dev-screensのガード
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-003-walk-record-persistence-and-history-api.md
---

正本: `docs/adr/ADR-003-walk-record-persistence-and-history-api.md` 決定3（`client_walk_id` による冪等化、
`UNIQUE(user_id, client_walk_id)`）、`packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md`
決定6（サインアウト時の sessionCleanup）。SS-19 レビュー時の Medium（signOut で散歩ストアが未クリア）は
sessionCleanup レジストリで解消済み。

**How to apply:**
- **冪等キーの暗号強度は不要という主張を判定するときは、一意制約のスコープ（グローバルかユーザー単位か）を
  必ず実コードで確認する。** `client_walk_id` は `Math.random` ベースの UUID v4（`src/lib/uuid.ts`）だが、
  制約がユーザースコープで `WalkRepository` が全メソッドで `user_id` 必須のため他ユーザーとの衝突は
  悪用できない。スコープがグローバルなら判定は変わる。衝突時は既存行を返す（新規データは破棄）ので、
  採番方式を変える場合は再評価する。
- 軌跡の送信整形（`features/walk/lib/walkTrackPayload.ts`: 小数6桁に丸め → 連続重複除去 →
  `MAX_TRACK_POINTS=10_000` 超過時のみ先頭・末尾保持の等間隔ダウンサンプリング）は backend の
  `schemas.py` の定数と一致しているか。新たな軌跡送信箇所でこの同期が崩れていないか。
- `saveWalk()` は意図的に `signal` を渡さず画面離脱でも中断しない。サインアウト時の後始末と
  組み合わさる変更（後始末の順序・対象ストア）では、前ユーザーのドラフトが次ユーザーのトークンで
  送信されないかを確認する。
- 開発用ショートカット（`ScreenCatalog` の「散歩サマリ」が実際に `POST /walks` を発火）は
  `app/dev-screens.tsx` の `isDevToolsEnabled()`（本番ビルド以外で許可）でガードされる。staging の
  テスターは自分のアカウントへ書き込める（ADR-M-007 SS-148 追補で許容）。

関連: [[walk-location-review-checklist]]、[[project_ss37_guest_walk_signin_merge]]
