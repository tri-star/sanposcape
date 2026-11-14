import {
  HISTORY_AUTH_STATE,
  type HistoryAuthState,
} from "@/features/history/lib/historyStatsState";
import type { WalkHistoryErrorCode } from "@/features/history/lib/walkHistoryError";

export type WalkDeleteStatus = "idle" | "deleting" | "deleted" | "error";

export type WalkDetailBodyState =
  | "invalid-id" // walkId が無い（ディープリンクの不正値）
  | "sign-in-required" // ゲスト（ディープリンクで未サインインのまま開いた。SS-45）
  | "deleted" // 削除完了（一覧へ遷移するまでの表示）
  | "not-found" // 404（自分の削除に由来しないもの）
  | "error" // その他の取得失敗
  | "loading"
  | "ready";

export type ResolveWalkDetailBodyStateInput = {
  /** ルート（`app/walk-history/[walkId].tsx`）が注入する認証状態（ADR-M-009 決定8）。 */
  authState: HistoryAuthState;
  hasWalkId: boolean;
  deleteStatus: WalkDeleteStatus;
  errorCode: WalkHistoryErrorCode | null;
  isLoading: boolean;
  hasWalk: boolean;
};

/**
 * 詳細画面が「今どの状態を描画するか」を決める純粋関数。
 *
 * 背景（重要）: 削除成功時に `invalidateQueries({ queryKey: ["walks"] })` を呼ぶと、
 * まだマウントされている `useWalkDetail` の active query が再取得され 404 → エラーカードに
 * なりうる（一覧へ遷移する直前に「見つかりませんでした」が一瞬出る）。
 * `deleteStatus === "deleted"` を最優先にすることでこれを覆い隠す。
 *
 * 判定順（この順序が仕様）:
 * 1. `deleteStatus === "deleted"` → "deleted"
 * 2. `!hasWalkId` → "invalid-id"
 * 3. `authState === "restoring"` → "loading"（復元中は通信せず読み込み表示。サインイン案内を一瞬でも見せない）
 * 4. `authState === "guest"` → "sign-in-required"（通信しない）
 * 5. `errorCode === "not_found"` → "not-found"
 * 6. `errorCode !== null` → "error"
 * 7. `isLoading || !hasWalk` → "loading"
 * 8. → "ready"
 *
 * 3・4（SS-45）: この画面はディープリンク（`sanposcape://walk-history/<id>`）で未サインインのまま開ける
 * （`AuthGate` はゲストも保護ルートに通す。ADR-M-009 SS-57 追補）。復元中・ゲストでは query を無効化するので、
 * エラー・読み込みより先に判定する（無効化した query は `isPending` のまま残る）。`invalid-id` は認証に
 * 関係なく確定するので先に置く。
 *
 * `deleteStatus === "deleting"` は body 状態を変えない（本文は "ready" のまま。
 * 進捗はダイアログ側が出す）。
 */
export function resolveWalkDetailBodyState(
  input: ResolveWalkDetailBodyStateInput,
): WalkDetailBodyState {
  if (input.deleteStatus === "deleted") {
    return "deleted";
  }
  if (!input.hasWalkId) {
    return "invalid-id";
  }
  if (input.authState === HISTORY_AUTH_STATE.restoring) {
    return "loading";
  }
  if (input.authState === HISTORY_AUTH_STATE.guest) {
    return "sign-in-required";
  }
  if (input.errorCode === "not_found") {
    return "not-found";
  }
  if (input.errorCode !== null) {
    return "error";
  }
  if (input.isLoading || !input.hasWalk) {
    return "loading";
  }
  return "ready";
}

/** 削除ボタン（ヘッダー）を出してよいか。 */
export function canDeleteWalk(state: WalkDetailBodyState): boolean {
  return state === "ready";
}
