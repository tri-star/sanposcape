import {
  HISTORY_AUTH_STATE,
  type HistoryAuthState,
} from "@/features/history/lib/historyStatsState";
import { type AuthSessionStatus, useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 認証セッションの `status` → 記録画面の認証状態。`satisfies` で `AuthSessionStatus` の全値を網羅させる
 * （`status` に値が増えたら型検査で落ちる）。`loading` をゲストにしない理由は `HISTORY_AUTH_STATE` の JSDoc を参照。
 */
const HISTORY_AUTH_STATE_BY_SESSION_STATUS = {
  authenticated: HISTORY_AUTH_STATE.signedIn,
  loading: HISTORY_AUTH_STATE.restoring,
  guest: HISTORY_AUTH_STATE.guest,
} as const satisfies Record<AuthSessionStatus, HistoryAuthState>;

/**
 * 記録画面（アカウントタブ・履歴の一覧と詳細）のルートが、features/history へ注入する認証状態を読む。
 * features/history は認証ストアを import できない（ADR-M-009 決定8、.oxlintrc.json の no-restricted-imports）ので、
 * 写し方を3つのルートで重複させないためにここへまとめる。
 */
export function useHistoryAuthState(): HistoryAuthState {
  // セレクタはプリミティブを返す（zustand v5）。
  const status = useAuthSessionStore((state) => state.status);
  return HISTORY_AUTH_STATE_BY_SESSION_STATUS[status];
}
