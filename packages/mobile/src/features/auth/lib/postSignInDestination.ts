import { ACTIVE_WALK_LANDING_HREF, DEFAULT_LANDING_HREF } from "@/features/auth/lib/landingHref";

export type LandingHref = typeof DEFAULT_LANDING_HREF | typeof ACTIVE_WALK_LANDING_HREF;

export type PostSignInDestination =
  | { type: "replace"; href: LandingHref }
  | { type: "dismissTo"; href: LandingHref | "/walk-summary" };

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
  /**
   * サインイン画面の下に戻れる画面がある（`router.canGoBack()`）。スプラッシュ→サインインは
   * `replace` 連鎖なので false、ピンタブ・設定・サマリ画面などから `push`/`replace` で来た場合は
   * その下に `(tabs)` があるので true。true のときに `replace` するとルートスタックが
   * `[(tabs)旧, (tabs)新]` の二重になる（Android バックが古いタブへ戻る等。SS-146）ので、
   * 既存の `(tabs)` へ `dismissTo` で戻る。
   */
  canGoBack: boolean;
};

/** 着地点（`LandingHref`）へ、戻れるなら dismissTo、戻れないなら replace で向かう遷移を作る（純粋）。 */
function landingNavigation(href: LandingHref, canGoBack: boolean): PostSignInDestination {
  return { type: canGoBack ? "dismissTo" : "replace", href };
}

/** 「ゲストで試す」の遷移アクション。 */
export type GuestEntryDestination = {
  type: "replace" | "dismissTo";
  href: LandingHref;
};

/**
 * サインイン成功後の遷移先と遷移方法を決める（純粋）。
 *
 * 優先順:
 * 1. 進行中の散歩がある → `/(tabs)`（ナビタブ。`WalkActiveView` を隠さない。SS-57 ローカルレビュー対応）。
 *    保存待ちドラフトより優先する。散歩の最中にユーザーを別画面へ連れて行かないため
 *    （この2つが同時に立つのは「保存待ちのまま次の散歩を始めた」稀なケース）。
 * 2. サマリの CTA から来た保存待ちドラフトがある → `/walk-summary` へ `dismissTo` で戻す（SS-37。
 *    SS-37 ローカルレビュー対応で「保存待ちドラフトがあるだけ」から「CTA 経由の意思表示がある」
 *    条件へ限定した）。`replace` を使わないのは、サマリ画面から CTA で `push` して来た場合に
 *    スタックへサマリが二重に積まれるのを避けるため。`dismissTo` はスタックに
 *    対象が無ければ現在の画面を置き換えるので、設定画面からサインインした場合も破綻しない。
 * 3. それ以外（意思表示の無い保存待ちドラフトのみ、または何も無い） → ピンタブ（`/(tabs)/pins`）
 *    へ `replace`（SS-145）。CTA を経由しない無関係なサインインでは、保存待ちドラフトが残っていても
 *    サマリへは連れて行かない（Security High 対応）。ドラフトの自動再送自体は `useWalkSave` の
 *    多重防御に任せる（`isSignedIn` の変化を見て再発火するが、こちらも同じ意思表示ゲートを持つ）。
 *
 * 着地点（1・3）への遷移は、サインイン画面の下に戻れる画面がある（`canGoBack`）ときは
 * `dismissTo`、無い（スプラッシュから来た）ときは `replace`（SS-146。ルートスタックの `(tabs)` 二重化を防ぐ）。
 *
 * SS-57 の背景（進行中の散歩があるとき無条件に `/walk-start` へ送ると、進行中の散歩が
 * 見えない画面に飛ばされ、気づかず「散歩を始める」を押すと無警告で上書きされる）は
 * 引き続き有効。
 */
export function getPostSignInDestination(input: PostSignInInput): PostSignInDestination {
  if (input.hasActiveWalk) return landingNavigation(ACTIVE_WALK_LANDING_HREF, input.canGoBack);
  if (input.wantsToSaveFinishedWalk) return { type: "dismissTo", href: "/walk-summary" };
  return landingNavigation(DEFAULT_LANDING_HREF, input.canGoBack);
}

/**
 * 「ゲストで試す」の遷移（SS-145）。進行中の散歩があればナビタブ、無ければピンタブ。
 * 「散歩中 → 設定 → サインイン導線 → ゲストで試す」の経路で、進行中の散歩を見えない位置に置かないため
 * （サインイン成功時の SS-57 ローカルレビュー対応と同じ理由）。保存意思（サマリへの dismissTo）は見ない
 * （ゲストは保存できないので、サマリへ戻しても再送されない）。遷移方法はサインイン成功時と同じく
 * `canGoBack` で決める（SS-146）。
 */
export function getGuestEntryDestination(input: {
  hasActiveWalk: boolean;
  canGoBack: boolean;
}): GuestEntryDestination {
  const href = input.hasActiveWalk ? ACTIVE_WALK_LANDING_HREF : DEFAULT_LANDING_HREF;
  return { type: input.canGoBack ? "dismissTo" : "replace", href };
}
