/**
 * サインイン画面へ渡す「サインイン後に戻す呼び出し元」（SS-151）。
 *
 * ルートパラメータ（ディープリンクからも書ける）で受けるので、値は許可リストで検証し、
 * href は固定表から引く。任意の href を受け取らない（オープンリダイレクトにしない）。
 * 未知の値・配列・未指定は `null`（従来どおりの着地点）として扱う。
 */
export const SIGN_IN_RETURN_TO_HREFS = {
  account: "/(tabs)/account",
} as const;

/**
 * サインイン画面だけを閉じて（`router.back()`）、すぐ下にある呼び出し元へ戻す値（SS-250）。
 * 招待の受諾画面（`/invitations/accept?token=`）は、トークンをルートパラメータに持つ。`dismissTo` は戻る先の
 * ルートのパラメータを href から作り直して消すので、パラメータを持つ画面はこちらで戻す。
 */
export const SIGN_IN_RETURN_TO_BACK = ["invitation"] as const;

export type SignInReturnToHrefKey = keyof typeof SIGN_IN_RETURN_TO_HREFS;
export type SignInReturnTo = SignInReturnToHrefKey | (typeof SIGN_IN_RETURN_TO_BACK)[number];
export type SignInReturnToHref = (typeof SIGN_IN_RETURN_TO_HREFS)[SignInReturnToHrefKey];

export function isSignInReturnToBack(
  value: SignInReturnTo,
): value is (typeof SIGN_IN_RETURN_TO_BACK)[number] {
  return (SIGN_IN_RETURN_TO_BACK as readonly string[]).includes(value);
}

export function parseSignInReturnTo(value: unknown): SignInReturnTo | null {
  if (typeof value !== "string") return null;
  if (Object.hasOwn(SIGN_IN_RETURN_TO_HREFS, value)) return value as SignInReturnTo;
  return (SIGN_IN_RETURN_TO_BACK as readonly string[]).includes(value)
    ? (value as SignInReturnTo)
    : null;
}
