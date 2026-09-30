import type { WalkStatsErrorCode } from "@/features/history/lib/walkStatsError";

export type HistoryStatsState = "sign-in-required" | "error" | "loading" | "ready";

/**
 * 記録画面の集計部分の状態。判定順（この順序が仕様）: sign-in-required → error → loading → ready。
 * ゲストでは query を無効化する。TanStack Query v5 では、無効化した query はデータが無いと
 * `isPending === true` のままになるため、ゲストを最初に判定しないと永久にローディングになる。
 */
export function resolveHistoryStatsState(input: {
  isSignedIn: boolean;
  errorCode: WalkStatsErrorCode | null;
  isLoading: boolean;
}): HistoryStatsState {
  if (!input.isSignedIn) return "sign-in-required";
  if (input.errorCode !== null) return "error";
  if (input.isLoading) return "loading";
  return "ready";
}

export const HISTORY_SIGN_IN_TITLE = "サインインすると、歩いた記録を見られます。";
export const HISTORY_SIGN_IN_DESCRIPTION = "歩いた距離や連続日数、最近の散歩をここで確認できます。";
