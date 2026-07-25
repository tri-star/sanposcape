import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { AuthError, isAuthError, toAuthError } from "@/services/auth/authError";

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
