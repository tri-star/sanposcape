import type { AuthErrorCode, AuthProvider } from "@/services/auth";

/** 汎用の失敗。原因を分類できなかったとき（backend の 5xx・通信失敗を含む）。 */
export const SIGN_IN_FAILED_MESSAGE = "サインインに失敗しました。もう一度お試しください。";
export const SIGN_IN_CONFIGURATION_MESSAGE =
  "サインインの設定が未完了です。しばらくしてから再度お試しください。";
/** Google の SDK が端末側で失敗した（backend に届いていない）。汎用の失敗と文言で区別できるようにする（SS-82）。 */
export const GOOGLE_PROVIDER_FAILED_MESSAGE =
  "Google のサインインを開始できませんでした。しばらくしてから再度お試しください。";
/** Google のキャンセルが続いたとき。OAuth の設定不備もキャンセルとして返るので、無反応のままにしない（SS-82）。 */
export const GOOGLE_REPEATED_CANCEL_MESSAGE =
  "Google のサインインが完了しませんでした。続く場合は、時間をおいて再度お試しください。";

/** Google のキャンセルがこの回数続いたら案内を出す。1回目は本当のキャンセルとみなして無反応にする。 */
export const GOOGLE_CANCEL_NOTICE_THRESHOLD = 2;

export type SignInFailureFeedback = {
  /** 出すトーストの文言。null なら出さない。 */
  message: string | null;
  /** 次の失敗の判定に渡す、Google のキャンセルの連続回数。 */
  consecutiveGoogleCancels: number;
};

/**
 * サインインの失敗に対して出すトーストを決める（純粋）。
 *
 * Google の `cancelled` は、ユーザーが閉じたときだけでなく、SHA-1 の登録漏れ・パッケージ名の誤り・
 * Web/Android のクライアント ID の取り違えでも返る（Credential Manager が RESULT_CANCELED を返す。ライブラリの
 * `GoogleSignInController.kt` のコメント）。JS からは2つを区別できない（アカウント選択の画面が出たかも分からない）ため、
 * 連続 `GOOGLE_CANCEL_NOTICE_THRESHOLD` 回目から案内を出す。Apple のキャンセルは数えない（設定ミスは
 * `ERR_REQUEST_UNKNOWN` で来て区別できる。ADR-002 SS-199 追補）。
 * 連続回数は呼び出し側が保持し、成功したとき・Google のキャンセル以外で失敗したとき（Apple のキャンセルを含む）は 0 に戻す。
 * 「同じ Google のボタンで続けて進めない」ことだけを数えるため。
 */
export function getSignInFailureFeedback(input: {
  provider: AuthProvider;
  /** 分類済みのエラーコード。AuthError 以外の例外なら null。 */
  code: AuthErrorCode | null;
  consecutiveGoogleCancels: number;
}): SignInFailureFeedback {
  const { provider, code } = input;

  if (code === "cancelled") {
    if (provider !== "google") {
      return { message: null, consecutiveGoogleCancels: 0 };
    }
    const count = input.consecutiveGoogleCancels + 1;
    return {
      message: count >= GOOGLE_CANCEL_NOTICE_THRESHOLD ? GOOGLE_REPEATED_CANCEL_MESSAGE : null,
      consecutiveGoogleCancels: count,
    };
  }

  return { message: messageForFailure(provider, code), consecutiveGoogleCancels: 0 };
}

function messageForFailure(provider: AuthProvider, code: AuthErrorCode | null): string {
  if (code === "configuration") {
    return SIGN_IN_CONFIGURATION_MESSAGE;
  }
  if (code === "provider_failed" && provider === "google") {
    return GOOGLE_PROVIDER_FAILED_MESSAGE;
  }
  return SIGN_IN_FAILED_MESSAGE;
}
