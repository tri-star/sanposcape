import { useEffect } from "react";

import { authService } from "@/services/auth";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

// モジュールスコープのラッチ。React StrictMode の二重実行でも復元は1回に保つ。
let bootstrapStarted = false;

/**
 * アプリ起動時に `authService.restoreSession()` を**1回だけ**呼び、結果をストアに反映する（SS-13 / ADR-009）。
 * スプラッシュ画面ではなくルートレイアウト（`AuthGate`）で走らせることで、
 * **ディープリンクのコールドスタートでもセッションが復元される**ようにする。
 *
 * 重要な注意:
 * - **cleanup で `AbortController.abort()` してはいけない**。ラッチをモジュールスコープに
 *   置いているため、StrictMode の「effect → cleanup → effect」で1回目を中断すると
 *   2回目がラッチで弾かれ、`status` が永久に `loading` のままになる。`AuthGate` はルートに
 *   常駐しアンマウントされないので、中断の必要が無い。タイムアウトは
 *   `createSessionAuthService` 側の `restoreTimeoutMs`（既定 10s）が持つ。
 * - `restoreSession()` は API のトークン取得・更新と single-flight を共有する（SS-135）。
 *   起動時の設定取得と重なっても refresh token を二重に送らない。
 * - 復元成功時は `createSessionAuthService` 内の `setCurrentUser` → `onSessionChange` 経由で
 *   すでにストアが `authenticated` になっているが、`setSession(user)` の再適用は冪等なので問題ない。
 *   復元失敗/未保持時は通知が飛ばないため、この hook の `setSession(null)` が唯一の
 *   `loading → guest` 遷移点になる。
 *
 * `hooks/` は vitest 対象外（`architecture-guideline.md`）。テストは書かない。
 */
export function useAuthSessionBootstrap(): void {
  useEffect(() => {
    if (bootstrapStarted) return;
    bootstrapStarted = true;

    void authService
      // 一時的な通信失敗で起動を止めない（今回の起動はサインインへ案内する）。
      .restoreSession()
      .catch(() => null)
      .then((user) => {
        useAuthSessionStore.getState().setSession(user ?? null);
      });
  }, []);
}
