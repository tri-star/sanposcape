import { isApiError } from "@/api/apiError";
import type { AuthErrorCode } from "@/services/auth/types";

export class AuthError extends Error {
  readonly isAuthError = true;

  constructor(
    readonly code: AuthErrorCode,
    message?: string,
    readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "AuthError";
  }
}

export function isAuthError(error: unknown): error is AuthError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isAuthError?: boolean }).isAuthError === true
  );
}

/** Google SDK のキャンセル系エラーコード（`react-native-nitro-google-signin` の status codes）。 */
const GOOGLE_CANCELLED_CODES = new Set(["SIGN_IN_CANCELLED", "IN_PROGRESS"]);
/** Google SDK の設定不備系エラーコード。 */
const GOOGLE_CONFIGURATION_CODES = new Set(["DEVELOPER_ERROR", "PLAY_SERVICES_NOT_AVAILABLE"]);
/**
 * Google SDK が端末側で失敗したコード（ユーザーのキャンセルではない）。ONE_TAP_START_FAILED は Credential Manager の
 * 失敗の既定値で、実運用で最も多い。SIGN_IN_REQUIRED 以下はサインインの流れでは出ないが、汎用メッセージに潰さない（SS-82）。
 */
const GOOGLE_PROVIDER_FAILED_CODES = new Set([
  "ONE_TAP_START_FAILED",
  "SIGN_IN_REQUIRED",
  "SIGN_OUT_FAILED",
  "REVOKE_ACCESS_FAILED",
]);

/**
 * Nitro はネイティブの例外を `message` だけの JS の Error にするので、`error.code` は実機では来ない（SS-82）。
 * Android は fbjni が `printStackTrace` の出力を使うので、1行目が `<例外のクラス名>: <メッセージ>` で、その後に
 * `\tat …` のフレームが続く（行頭・行末に固定した正規表現を書かない）。iOS は `oneTapStartFailed("<メッセージ>")` のような enum の表記になる。
 * ライブラリ（1.3.0）が固定で付ける文言と iOS の case 名から、元のコードを推定する。
 */
const GOOGLE_CODE_BY_MESSAGE: readonly (readonly [RegExp, string])[] = [
  // iOS（GoogleSignInNativeError の case 名。notConfigured / noActivity はライブラリが IN_PROGRESS にしている）
  [/^playServicesNotAvailable\b/, "PLAY_SERVICES_NOT_AVAILABLE"],
  [/^oneTapStartFailed\b/, "ONE_TAP_START_FAILED"],
  [/^signInRequired\b/, "SIGN_IN_REQUIRED"],
  [/^(notConfigured|noActivity)\b/, "IN_PROGRESS"],
  // Android（GoogleSignInController / GoogleSignInAuthorizationHelper のメッセージ）
  [/Check the Android OAuth client package name and SHA-1/, "DEVELOPER_ERROR"],
  [/Google Play Services are not available/, "PLAY_SERVICES_NOT_AVAILABLE"],
  [/No Activity available/, "IN_PROGRESS"],
];

/** expo-apple-authentication のキャンセル（ASAuthorizationError.canceled）。 */
const APPLE_CANCELLED_CODES = new Set(["ERR_REQUEST_CANCELED"]);
/** ネイティブモジュールが無い（iOS 以外・Expo Go 等）。expo-modules-core の UnavailabilityError。 */
const APPLE_CONFIGURATION_CODES = new Set(["ERR_UNAVAILABLE"]);
// ERR_REQUEST_UNKNOWN（ASAuthorizationError 1000）はキャンセル扱いにしない。capability の欠落など
// 設定ミスでも同じコードになり、無反応にすると原因が見えなくなるため "unknown" のままにする。

/**
 * 任意の例外を AuthError に正規化する（純粋。副作用なし）。
 * Google / Apple のエラーはライブラリを import せず、`error.code` の文字列だけを見る
 * （純粋性を保ち vitest でテストするため）。
 */
export function toAuthError(error: unknown): AuthError {
  if (isAuthError(error)) {
    return error;
  }

  if (isApiError(error)) {
    if (error.status === 401 || error.status === 403) {
      return new AuthError("unauthorized", error.message, error);
    }
    if (error.status === 400) {
      // /auth/session の 400 は Unsupported provider だけ。apple では backend の
      // APPLE_ALLOWED_AUDIENCES 未設定を意味する（ADR-002 SS-197 追補）。/auth/refresh は 400 を返さない。
      return new AuthError("configuration", error.message, error);
    }
    if (error.status === 404) {
      return new AuthError("configuration", error.message, error);
    }
    return new AuthError("unknown", error.message, error);
  }

  const code = extractErrorCode(error);
  if (code !== null) {
    const classified = classifyByCode(code);
    if (classified !== null) {
      return new AuthError(classified, code, error);
    }
  }

  if (error instanceof TypeError) {
    return new AuthError("network", error.message, error);
  }

  return new AuthError("unknown", error instanceof Error ? error.message : undefined, error);
}

/**
 * Google SDK（`react-native-nitro-google-signin`）が投げた例外を AuthError に正規化する（純粋）。
 * `googleSignIn.ts` が SDK の呼び出しを包んで使う。`.code` が無ければメッセージから推定し（`GOOGLE_CODE_BY_MESSAGE`）、
 * 推定できなくても Google の SDK から来たことは確かなので `unknown` ではなく `provider_failed` にする
 * （backend に届く前の失敗と分かるだけで切り分けが進む。SS-82）。message には推定したコードと元のメッセージを残す（ログ用）。
 */
export function toGoogleSignInError(error: unknown): AuthError {
  if (isAuthError(error)) {
    return error;
  }

  const rawMessage = error instanceof Error ? error.message : String(error);
  const code = extractErrorCode(error) ?? inferGoogleCodeFromMessage(rawMessage);
  const classified = code === null ? null : classifyByCode(code);
  // 推定には全文を使い、message には1行目だけを残す（Android のスタックトレースはログを長くするだけ）。
  return new AuthError(
    classified ?? "provider_failed",
    `${code ?? "UNKNOWN"}: ${firstLine(rawMessage)}`,
    error,
  );
}

/** 複数行のメッセージ（Android のスタックトレース付きの例外）の1行目。 */
export function firstLine(message: string): string {
  const index = message.indexOf("\n");
  return index === -1 ? message : message.slice(0, index);
}

function classifyByCode(code: string): AuthErrorCode | null {
  if (GOOGLE_CANCELLED_CODES.has(code) || APPLE_CANCELLED_CODES.has(code)) {
    return "cancelled";
  }
  if (GOOGLE_CONFIGURATION_CODES.has(code) || APPLE_CONFIGURATION_CODES.has(code)) {
    return "configuration";
  }
  if (GOOGLE_PROVIDER_FAILED_CODES.has(code)) {
    return "provider_failed";
  }
  return null;
}

function inferGoogleCodeFromMessage(message: string): string | null {
  for (const [pattern, code] of GOOGLE_CODE_BY_MESSAGE) {
    if (pattern.test(message)) {
      return code;
    }
  }
  return null;
}

function extractErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
