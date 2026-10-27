import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  AuthError,
  isAuthError,
  toAuthError,
  toGoogleSignInError,
} from "@/services/auth/authError";

describe("toAuthError", () => {
  it("ApiError 401 は unauthorized になる", () => {
    expect(toAuthError(new ApiError(401)).code).toBe("unauthorized");
  });

  it("ApiError 403 は unauthorized になる", () => {
    expect(toAuthError(new ApiError(403)).code).toBe("unauthorized");
  });

  it("ApiError 404（dev-session 無効）は configuration になる", () => {
    expect(toAuthError(new ApiError(404)).code).toBe("configuration");
  });

  it("ApiError 400（apple の APPLE_ALLOWED_AUDIENCES 未設定）は configuration になる", () => {
    expect(toAuthError(new ApiError(400)).code).toBe("configuration");
  });

  it("ApiError 422 と 503 は unknown になる", () => {
    expect(toAuthError(new ApiError(422)).code).toBe("unknown");
    expect(toAuthError(new ApiError(503)).code).toBe("unknown");
  });

  it("Apple の ERR_REQUEST_CANCELED は cancelled になる", () => {
    expect(toAuthError({ code: "ERR_REQUEST_CANCELED" }).code).toBe("cancelled");
  });

  it("Apple の ERR_UNAVAILABLE は configuration になる", () => {
    expect(toAuthError({ code: "ERR_UNAVAILABLE" }).code).toBe("configuration");
  });

  it("Apple の ERR_REQUEST_UNKNOWN はキャンセル扱いにせず unknown のまま", () => {
    expect(toAuthError({ code: "ERR_REQUEST_UNKNOWN" }).code).toBe("unknown");
  });

  it("その他の ApiError は unknown になる", () => {
    expect(toAuthError(new ApiError(500)).code).toBe("unknown");
  });

  it("Google SDK の SIGN_IN_CANCELLED は cancelled になる", () => {
    expect(toAuthError({ code: "SIGN_IN_CANCELLED" }).code).toBe("cancelled");
  });

  it("Google SDK の IN_PROGRESS は cancelled になる", () => {
    expect(toAuthError({ code: "IN_PROGRESS" }).code).toBe("cancelled");
  });

  it("Google SDK の DEVELOPER_ERROR は configuration になる", () => {
    expect(toAuthError({ code: "DEVELOPER_ERROR" }).code).toBe("configuration");
  });

  it("Google SDK の PLAY_SERVICES_NOT_AVAILABLE は configuration になる", () => {
    expect(toAuthError({ code: "PLAY_SERVICES_NOT_AVAILABLE" }).code).toBe("configuration");
  });

  it.each(["ONE_TAP_START_FAILED", "SIGN_IN_REQUIRED", "SIGN_OUT_FAILED", "REVOKE_ACCESS_FAILED"])(
    "Google SDK の %s は provider_failed になる",
    (code) => {
      expect(toAuthError({ code }).code).toBe("provider_failed");
    },
  );

  it("TypeError（fetch の通信失敗）は network になる", () => {
    expect(toAuthError(new TypeError("Failed to fetch")).code).toBe("network");
  });

  it("それ以外は unknown になる", () => {
    expect(toAuthError(new Error("boom")).code).toBe("unknown");
    expect(toAuthError("plain string").code).toBe("unknown");
  });

  it("AuthError を渡すと同一インスタンスが返る（二重ラップしない）", () => {
    const original = new AuthError("cancelled");
    expect(toAuthError(original)).toBe(original);
  });

  it("cause に元エラーが保持される", () => {
    const original = new Error("boom");
    const result = toAuthError(original);
    expect(result.cause).toBe(original);
  });
});

describe("toGoogleSignInError", () => {
  // Nitro は code を JS に渡さないので、実機の例外は message だけの Error になる（SS-82）。
  const android = (message: string) =>
    new Error(`com.nitrogooglesignin.GoogleSignInException: ${message}`);

  it.each([
    [
      "DEVELOPER_ERROR（SHA-1 の案内文）",
      android(
        "Credential request failed. Check the Android OAuth client package name and SHA-1 fingerprints (debug, release upload key, and Play App Signing certificate). Use the Web client ID in configure({ webClientId }), not the Android client ID.",
      ),
      "configuration",
    ],
    [
      "PLAY_SERVICES_NOT_AVAILABLE",
      android("Google Play Services are not available (status=2)."),
      "configuration",
    ],
    [
      "IN_PROGRESS（Activity が無い）",
      android("No Activity available. Retry when the app is in the foreground."),
      "cancelled",
    ],
    [
      "ONE_TAP_START_FAILED（中断）",
      android("Credential request was interrupted. Retry the sign-in."),
      "provider_failed",
    ],
  ] as const)("Android の %s を分類する", (_label, error, expected) => {
    expect(toGoogleSignInError(error).code).toBe(expected);
  });

  it.each([
    ['playServicesNotAvailable("x")', "configuration"],
    ['oneTapStartFailed("The operation couldn’t be completed.")', "provider_failed"],
    ['signInRequired("No signed-in Google user.")', "provider_failed"],
    ["notConfigured", "cancelled"],
    ["noActivity", "cancelled"],
  ] as const)("iOS の %s を分類する", (message, expected) => {
    expect(toGoogleSignInError(new Error(message)).code).toBe(expected);
  });

  it("推定できない例外も unknown ではなく provider_failed にする（backend に届く前の失敗）", () => {
    expect(toGoogleSignInError(new Error("something else")).code).toBe("provider_failed");
    expect(toGoogleSignInError("plain string").code).toBe("provider_failed");
  });

  it("code が付いていればメッセージより優先する", () => {
    const error = Object.assign(new Error("No Activity available."), { code: "DEVELOPER_ERROR" });
    expect(toGoogleSignInError(error).code).toBe("configuration");
  });

  it("message に推定したコードと元のメッセージを残し、cause に元の例外を保持する", () => {
    const original = new Error('oneTapStartFailed("x")');
    const result = toGoogleSignInError(original);
    expect(result.message).toBe(`ONE_TAP_START_FAILED: ${original.message}`);
    expect(result.cause).toBe(original);
  });

  it("Android のスタックトレース付きの message でも推定し、message には1行目だけを残す", () => {
    const original = new Error(
      [
        "com.nitrogooglesignin.GoogleSignInException: Credential request failed. Check the Android OAuth client package name and SHA-1 fingerprints.",
        "\tat com.nitrogooglesignin.GoogleSignInController.mapGetCredentialFailure(GoogleSignInController.kt:412)",
        "\tat com.nitrogooglesignin.GoogleSignInController.getGoogleCredential(GoogleSignInController.kt:404)",
      ].join("\n"),
    );
    const result = toGoogleSignInError(original);
    expect(result.code).toBe("configuration");
    expect(result.message).toBe(
      "DEVELOPER_ERROR: com.nitrogooglesignin.GoogleSignInException: Credential request failed. Check the Android OAuth client package name and SHA-1 fingerprints.",
    );
  });

  it("推定できないとき（Android の ONE_TAP_START_FAILED の大半）は message に UNKNOWN を付ける", () => {
    const original = android("Credential request was interrupted. Retry the sign-in.");
    expect(toGoogleSignInError(original).message).toBe(`UNKNOWN: ${original.message}`);
  });

  it("AuthError はそのまま返す（googleSignIn.ts の cancelled を二重に包まない）", () => {
    const original = new AuthError("cancelled", "signIn returned cancelled");
    expect(toGoogleSignInError(original)).toBe(original);
  });
});

describe("isAuthError", () => {
  it("AuthError インスタンスは true", () => {
    expect(isAuthError(new AuthError("network"))).toBe(true);
  });

  it("通常の Error は false", () => {
    expect(isAuthError(new Error("x"))).toBe(false);
  });

  it("null / undefined は false", () => {
    expect(isAuthError(null)).toBe(false);
    expect(isAuthError(undefined)).toBe(false);
  });
});
