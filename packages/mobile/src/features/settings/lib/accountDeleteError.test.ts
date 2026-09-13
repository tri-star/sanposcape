import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  type AccountDeleteErrorCode,
  accountDeleteErrorMessage,
  canRetryAccountDelete,
  isRetriableAccountDeleteError,
  toAccountDeleteErrorCode,
} from "@/features/settings/lib/accountDeleteError";

describe("toAccountDeleteErrorCode", () => {
  it("ApiError 401 は unauthorized になる", () => {
    expect(toAccountDeleteErrorCode(new ApiError(401))).toBe("unauthorized");
  });

  it("ApiError 500 / 503 は server になる", () => {
    expect(toAccountDeleteErrorCode(new ApiError(500))).toBe("server");
    expect(toAccountDeleteErrorCode(new ApiError(503))).toBe("server");
  });

  it("それ以外の ApiError（404 / 422 / 413）は unknown になる", () => {
    expect(toAccountDeleteErrorCode(new ApiError(404))).toBe("unknown");
    expect(toAccountDeleteErrorCode(new ApiError(422))).toBe("unknown");
    expect(toAccountDeleteErrorCode(new ApiError(413))).toBe("unknown");
  });

  it("TypeError（fetch の通信失敗）は network になる", () => {
    expect(toAccountDeleteErrorCode(new TypeError("Network request failed"))).toBe("network");
  });

  it("素の Error / undefined / 文字列は unknown になる", () => {
    expect(toAccountDeleteErrorCode(new Error("boom"))).toBe("unknown");
    expect(toAccountDeleteErrorCode(undefined)).toBe("unknown");
    expect(toAccountDeleteErrorCode("boom")).toBe("unknown");
  });
});

describe("accountDeleteErrorMessage", () => {
  const codes: AccountDeleteErrorCode[] = ["unauthorized", "network", "server", "unknown"];

  it.each(codes)("%s は非空文字列を返す", (code) => {
    expect(accountDeleteErrorMessage(code).length).toBeGreaterThan(0);
  });

  it("unauthorized の文言はサインインが必要だと伝える", () => {
    expect(accountDeleteErrorMessage("unauthorized")).toContain("サインイン");
  });
});

describe("isRetriableAccountDeleteError / canRetryAccountDelete", () => {
  it.each(["network", "server", "unknown"] as const)(
    "%s は再試行可能で削除ボタンを出す",
    (code) => {
      expect(isRetriableAccountDeleteError(code)).toBe(true);
      expect(canRetryAccountDelete(code)).toBe(true);
    },
  );

  it("unauthorized は再試行不可で削除ボタンを出さない", () => {
    expect(isRetriableAccountDeleteError("unauthorized")).toBe(false);
    expect(canRetryAccountDelete("unauthorized")).toBe(false);
  });

  it("errorCode が null（未実行・実行中）なら削除ボタンを出す", () => {
    expect(canRetryAccountDelete(null)).toBe(true);
  });
});
