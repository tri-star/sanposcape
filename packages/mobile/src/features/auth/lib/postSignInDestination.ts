export type PostSignInDestination =
  | { type: "replace"; href: "/walk-start" | "/(tabs)" }
  | { type: "dismissTo"; href: "/walk-summary" };

export type PostSignInInput = {
  /** 進行中の散歩がある（`useActiveWalkStore.activeWalk !== null`）。 */
  hasActiveWalk: boolean;
  /** 保存待ちのドラフトがある（`finishedWalk !== null && !saved`）。SS-37。 */
  hasUnsavedFinishedWalk: boolean;
};

/**
 * サインイン成功後の遷移先と遷移方法を決める（純粋）。
 *
 * 優先順:
 * 1. 進行中の散歩がある → `/(tabs)`（`WalkActiveView` を隠さない。SS-57 ローカルレビュー対応）。
 *    保存待ちドラフトより優先する。散歩の最中にユーザーを別画面へ連れて行かないため
 *    （この2つが同時に立つのは「保存待ちのまま次の散歩を始めた」稀なケース）。
 * 2. 保存待ちのドラフトがある → `/walk-summary` へ `dismissTo` で戻す（SS-37）。
 *    `replace` を使わないのは、サマリ画面から CTA で `push` して来た場合に
 *    スタックへサマリが二重に積まれるのを避けるため。`dismissTo` はスタックに
 *    対象が無ければ現在の画面を置き換えるので、設定画面からサインインした場合も破綻しない。
 * 3. それ以外 → 従来どおり `/walk-start` へ `replace`。
 *
 * SS-57 の背景（進行中の散歩があるとき無条件に `/walk-start` へ送ると、進行中の散歩が
 * 見えない画面に飛ばされ、気づかず「散歩を始める」を押すと無警告で上書きされる）は
 * 引き続き有効。
 */
export function getPostSignInDestination(input: PostSignInInput): PostSignInDestination {
  if (input.hasActiveWalk) return { type: "replace", href: "/(tabs)" };
  if (input.hasUnsavedFinishedWalk) return { type: "dismissTo", href: "/walk-summary" };
  return { type: "replace", href: "/walk-start" };
}
