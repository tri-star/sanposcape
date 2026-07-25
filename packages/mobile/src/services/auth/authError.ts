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
 * 任意の例外を AuthError に正規化する（純粋。副作用なし）。
 * Google SDK のエラーはライブラリを import せず、`error.code` の文字列だけを見る
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
    if (error.status === 404) {
      return new AuthError("configuration", error.message, error);
    }
    return new AuthError("unknown", error.message, error);
  }

  const googleCode = extractGoogleErrorCode(error);
  if (googleCode !== null) {
    if (GOOGLE_CANCELLED_CODES.has(googleCode)) {
      return new AuthError("cancelled", googleCode, error);
    }
    if (GOOGLE_CONFIGURATION_CODES.has(googleCode)) {
      return new AuthError("configuration", googleCode, error);
    }
  }

  if (error instanceof TypeError) {
    return new AuthError("network", error.message, error);
  }

  return new AuthError("unknown", error instanceof Error ? error.message : undefined, error);
}

function extractGoogleErrorCode(error: unknown): string | null {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
