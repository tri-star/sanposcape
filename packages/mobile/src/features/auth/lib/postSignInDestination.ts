export type PostSignInDestination =
  | { type: "replace"; href: "/walk-start" | "/(tabs)" }
  | { type: "dismissTo"; href: "/walk-summary" };

export type PostSignInInput = {
  /** 進行中の散歩がある（`useActiveWalkStore.activeWalk !== null`）。 */
  hasActiveWalk: boolean;
  /**
   * サマリ画面の CTA から「保存目的でサインインした」意思表示があり、かつ保存待ちのドラフトが
   * 残っている（`finishedWalk !== null && !saved && signInForSaveRequested`）。
   *
   * **SS-37 ローカルレビュー Security High 対応**: 単に「保存待ちドラフトがあるかどうか」だけで
   * 判定すると、共有端末で「ゲストが保存に失敗して放置」→「別人が設定画面など無関係な導線から
   * サインイン」しただけで、そのユーザーが強制的にサマリ画面（他人の軌跡）へ連れて行かれてしまう。
   * `signInForSaveRequested`（`useFinishedWalkStore`）を条件に含めることで、サマリの CTA を
   * 押した本人のサインインだけがこの分岐に乗るようにする。
   */
  wantsToSaveFinishedWalk: boolean;
};

/**
 * サインイン成功後の遷移先と遷移方法を決める（純粋）。
 *
 * 優先順:
 * 1. 進行中の散歩がある → `/(tabs)`（`WalkActiveView` を隠さない。SS-57 ローカルレビュー対応）。
 *    保存待ちドラフトより優先する。散歩の最中にユーザーを別画面へ連れて行かないため
 *    （この2つが同時に立つのは「保存待ちのまま次の散歩を始めた」稀なケース）。
 * 2. サマリの CTA から来た保存待ちドラフトがある → `/walk-summary` へ `dismissTo` で戻す（SS-37。
 *    SS-37 ローカルレビュー対応で「保存待ちドラフトがあるだけ」から「CTA 経由の意思表示がある」
 *    条件へ限定した）。`replace` を使わないのは、サマリ画面から CTA で `push` して来た場合に
 *    スタックへサマリが二重に積まれるのを避けるため。`dismissTo` はスタックに
 *    対象が無ければ現在の画面を置き換えるので、設定画面からサインインした場合も破綻しない。
 * 3. それ以外（意思表示の無い保存待ちドラフトのみ、または何も無い） → 従来どおり `/walk-start`
 *    へ `replace`。CTA を経由しない無関係なサインインでは、保存待ちドラフトが残っていても
 *    サマリへは連れて行かない（Security High 対応）。ドラフトの自動再送自体は `useWalkSave` の
 *    多重防御に任せる（`isSignedIn` の変化を見て再発火するが、こちらも同じ意思表示ゲートを持つ）。
 *
 * SS-57 の背景（進行中の散歩があるとき無条件に `/walk-start` へ送ると、進行中の散歩が
 * 見えない画面に飛ばされ、気づかず「散歩を始める」を押すと無警告で上書きされる）は
 * 引き続き有効。
 */
export function getPostSignInDestination(input: PostSignInInput): PostSignInDestination {
  if (input.hasActiveWalk) return { type: "replace", href: "/(tabs)" };
  if (input.wantsToSaveFinishedWalk) return { type: "dismissTo", href: "/walk-summary" };
  return { type: "replace", href: "/walk-start" };
}
