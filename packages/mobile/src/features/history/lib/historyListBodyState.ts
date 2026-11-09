import type { HistoryAuthState } from "@/features/history/lib/historyStatsState";
import type { WalkHistoryErrorCode } from "@/features/history/lib/walkHistoryError";

export type HistoryListBodyState =
  | { kind: "restoring" }
  | { kind: "sign-in-required" }
  | { kind: "error"; errorCode: WalkHistoryErrorCode }
  | { kind: "loading" }
  | { kind: "empty" }
  | { kind: "ready" };

/**
 * 散歩履歴の一覧（`/walk-history`）が今どの状態を描画するか。
 * 判定順（この順序が仕様）: restoring → sign-in-required → error → loading → empty → ready。
 *
 * この画面はアカウントタブの「すべて見る」から push で開くほか、ディープリンク（`sanposcape://walk-history`）で
 * 未サインインのまま直接開ける（`AuthGate` はゲストも保護ルートに通す。ADR-M-009 SS-57 追補・SS-45 追補）。
 * そのためアカウントタブ（`resolveHistoryStatsState`）と同じく、ゲストには通信せずサインイン案内を、
 * 復元中（コールドスタートのディープリンク）には通信せず読み込み表示を出す。
 * 復元中・ゲストでは query を無効化するので、データが無い query は `isPending === true` のまま残る。
 * 認証の2つを先に判定しないと、永久に読み込み表示になる。
 */
export function resolveHistoryListBodyState(input: {
  authState: HistoryAuthState;
  errorCode: WalkHistoryErrorCode | null;
  isLoading: boolean;
  itemCount: number;
}): HistoryListBodyState {
  if (input.authState === "restoring") return { kind: "restoring" };
  if (input.authState === "guest") return { kind: "sign-in-required" };
  if (input.errorCode !== null) return { kind: "error", errorCode: input.errorCode };
  if (input.isLoading) return { kind: "loading" };
  if (input.itemCount === 0) return { kind: "empty" };
  return { kind: "ready" };
}
