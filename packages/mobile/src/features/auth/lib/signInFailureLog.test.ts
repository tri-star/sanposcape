import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { buildSignInFailureLogDetail } from "@/features/auth/lib/signInFailureLog";
import { AuthError, toAuthError, toGoogleSignInError } from "@/services/auth/authError";

const SECRETS = [
  "access-token-secret",
  "refresh-token-secret",
  "user@example.com",
  "id-token-secret",
];

function expectNoSecrets(detail: Record<string, unknown>): void {
  const serialized = JSON.stringify(detail);
  for (const secret of SECRETS) {
    expect(serialized).not.toContain(secret);
  }
}

describe("buildSignInFailureLogDetail", () => {
  it("ApiError の本文（トークン・メールアドレスを含みうる）は載せない", () => {
    const original = new ApiError(500, undefined, {
      access_token: "access-token-secret",
      refresh_token: "refresh-token-secret",
      user: { email: "user@example.com" },
    });
    const detail = buildSignInFailureLogDetail({
      provider: "google",
      authError: toAuthError(original),
      error: original,
    });
    expect(detail).toEqual({
      provider: "google",
      code: "unknown",
      message: "HTTP error! status: 500",
      errorName: "ApiError",
      errorMessage: "HTTP error! status: 500",
    });
    expectNoSecrets(detail);
  });

  it("Google の SDK の例外は、推定したコードと元のメッセージの1行目だけを載せる", () => {
    const original = new Error(
      [
        "com.nitrogooglesignin.GoogleSignInException: Credential request was interrupted. Retry the sign-in.",
        "\tat com.nitrogooglesignin.GoogleSignInController.getGoogleCredential(GoogleSignInController.kt:391)",
      ].join("\n"),
    );
    const detail = buildSignInFailureLogDetail({
      provider: "google",
      authError: toGoogleSignInError(original),
      error: original,
    });
    expect(detail).toEqual({
      provider: "google",
      code: "provider_failed",
      message:
        "UNKNOWN: com.nitrogooglesignin.GoogleSignInException: Credential request was interrupted. Retry the sign-in.",
      errorName: "Error",
      errorMessage:
        "com.nitrogooglesignin.GoogleSignInException: Credential request was interrupted. Retry the sign-in.",
    });
  });

  it("cause の無い AuthError（キャンセル）は AuthError 自身を載せる", () => {
    const authError = new AuthError("cancelled", "createAccount returned cancelled");
    expect(
      buildSignInFailureLogDetail({ provider: "google", authError, error: authError }),
    ).toEqual({
      provider: "google",
      code: "cancelled",
      message: "createAccount returned cancelled",
      errorName: "AuthError",
      errorMessage: "createAccount returned cancelled",
    });
  });

  it("AuthError 以外の例外は code と message を null にする", () => {
    const detail = buildSignInFailureLogDetail({
      provider: "apple",
      authError: null,
      error: new Error("boom"),
    });
    expect(detail).toEqual({
      provider: "apple",
      code: null,
      message: null,
      errorName: "Error",
      errorMessage: "boom",
    });
  });
});
