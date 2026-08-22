---
name: project-display-text-ownership
description: backend は日本語の表示文言を発明しない方針 — API が空文字を返す前提で mobile 側が文言を持つ（SS-33 で確定、ADR-008 追補へ転記予定）
metadata:
  type: project
  scope: task-local
  source_issue: SS-33
---

**backend は「出発地」のような日本語の表示文言を API のフィールドに入れない方針**を採っている
（SS-33 の設計確定で明文化。OpenAPI の `description` も英語で統一されている）。
その帰結として、`destination.name` のような表示用フィールドは **空文字（`""`）で返りうる**。

**Why:** 表示文言をサーバーが持つと、クライアントの文脈（「目的地」なのか「出発地へ帰る」のか）を
サーバーが推測することになり、ロケール対応も含めて責務が混ざる。backend は「値の形」だけを返す。

**How to apply:** mobile のプランで API 由来の表示名を扱うときは、

1. **API のフィールドをそのまま画面に流さない**。整形関数（`toWalkRoute` 等）で
   「呼び出し側が渡した名前 → レスポンスの値（trim 後・非空なら） → 最終フォールバック」の順に解決し、
   **非空を型の不変条件として保証する**。
2. 文脈依存の文言（「出発地点」など）は **呼び出し側が渡す**。整形関数の中で
   `route_type` のような API の値を見て日本語を出し分けない（API の値と文言を結合させない）。
3. `??` は null/undefined しか見ないので**空文字を素通りさせる**。表示名の解決では必ず `trim().length > 0` で判定する。

既存の最終フォールバックは `FALLBACK_DESTINATION_NAME = "目的地"` で、**各ファイルのローカル定数**として
重複定義されている（`features/history/lib/walkHistoryItem.ts` / `walkDetail.ts` / `features/walk/lib/walkCreateRequest.ts`）。
共有モジュール化されていないのは意図的な現状であり、まとめるなら別タスクで。

**転記先**: SS-33 実装時に `packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md` の追補へ書く予定。
転記が済んだら `scope: durable` + `metadata.adr` に更新すること。

Related: [[project-explore-api-contract]]
