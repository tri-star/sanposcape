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
    if (GOOGLE_CANCELLED_CODES.has(code) || APPLE_CANCELLED_CODES.has(code)) {
      return new AuthError("cancelled", code, error);
    }
    if (GOOGLE_CONFIGURATION_CODES.has(code) || APPLE_CONFIGURATION_CODES.has(code)) {
      return new AuthError("configuration", code, error);
    }
  }

  if (error instanceof TypeError) {
    return new AuthError("network", error.message, error);
  }

  return new AuthError("unknown", error instanceof Error ? error.message : undefined, error);
}

function extractErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
