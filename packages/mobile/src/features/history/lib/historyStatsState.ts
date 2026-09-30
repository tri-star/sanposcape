import type { WalkStatsErrorCode } from "@/features/history/lib/walkStatsError";

/**
 * 記録画面から見た認証状態。ルート（`app/(tabs)/account.tsx`）が認証セッションの `status` から作って注入する
 * （features/history は認証を読まない。ADR-009 決定8）。`restoring` はセッション復元中（`status === "loading"`）で、
 * ゲストとは区別する（サインイン済みのユーザーにサインイン案内を見せないため）。
 */
export type HistoryAuthState = "signed-in" | "guest" | "restoring";

export type HistoryStatsState =
  | { kind: "restoring" }
  | { kind: "sign-in-required" }
  | { kind: "error"; errorCode: WalkStatsErrorCode }
  | { kind: "loading" }
  | { kind: "ready" };

/**
 * 記録画面の集計部分の状態。判定順（この順序が仕様）: restoring → sign-in-required → error → loading → ready。
 * 復元中・ゲストでは query を無効化する。TanStack Query v5 では、無効化した query はデータが無いと
 * `isPending === true` のままになるため、この2つを先に判定しないと永久にローディングになる（復元中は
 * 復元が終われば authState が変わるので抜けるが、通信はしない）。
 * 復元中は見た目を loading と同じにする（サインイン案内を出さない。コールドスタートのディープリンクでは
 * `AuthGate` が `loading` の間も children を通すので、復元中にこの画面が見えうる）。
 */
export function resolveHistoryStatsState(input: {
  authState: HistoryAuthState;
  errorCode: WalkStatsErrorCode | null;
  isLoading: boolean;
}): HistoryStatsState {
  if (input.authState === "restoring") return { kind: "restoring" };
  if (input.authState === "guest") return { kind: "sign-in-required" };
  if (input.errorCode !== null) return { kind: "error", errorCode: input.errorCode };
  if (input.isLoading) return { kind: "loading" };
  return { kind: "ready" };
}

export const HISTORY_SIGN_IN_TITLE = "サインインすると、歩いた記録を見られます。";
export const HISTORY_SIGN_IN_DESCRIPTION = "歩いた距離や連続日数、最近の散歩をここで確認できます。";
