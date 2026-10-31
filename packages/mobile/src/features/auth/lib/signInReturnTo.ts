/**
 * サインイン画面へ渡す「サインイン後に戻す呼び出し元」（SS-151）。
 *
 * ルートパラメータ（ディープリンクからも書ける）で受けるので、値は許可リストで検証し、
 * href は固定表から引く。任意の href を受け取らない（オープンリダイレクトにしない）。
 * 未知の値・配列・未指定は `null`（従来どおりの着地点）として扱う。
 */
export const SIGN_IN_RETURN_TO_HREFS = {
  account: "/(tabs)/account",
  // 招待の受諾画面（SS-250）。ゲストが「サインインして参加」を押したとき、スタックに残っている受諾画面へ
  // dismissTo で戻す（トークンは受諾画面のルートパラメータのまま残るので、別に持たない）。
  invitation: "/invitations/accept",
} as const;

export type SignInReturnTo = keyof typeof SIGN_IN_RETURN_TO_HREFS;
export type SignInReturnToHref = (typeof SIGN_IN_RETURN_TO_HREFS)[SignInReturnTo];

export function parseSignInReturnTo(value: unknown): SignInReturnTo | null {
  if (typeof value !== "string") return null;
  return Object.hasOwn(SIGN_IN_RETURN_TO_HREFS, value) ? (value as SignInReturnTo) : null;
}
