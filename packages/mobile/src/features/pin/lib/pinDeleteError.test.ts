import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  PIN_DELETE_DIALOG_DESCRIPTION,
  PIN_DELETE_DIALOG_TITLE,
  canRetryPinDelete,
  pinDeleteConfirmLabel,
  pinDeleteErrorMessage,
  toPinDeleteErrorCode,
  type PinDeleteErrorCode,
} from "@/features/pin/lib/pinDeleteError";

const ALL_CODES: PinDeleteErrorCode[] = [
  "unauthorized",
  "forbidden",
  "invalid_request",
  "network",
  "server",
  "unknown",
];

describe("toPinDeleteErrorCode", () => {
  it.each([
    [401, "unauthorized"],
    [403, "forbidden"],
    [413, "invalid_request"],
    [422, "invalid_request"],
    [500, "server"],
    [503, "server"],
    [404, "unknown"],
    [418, "unknown"],
  ] as const)("%d -> %s", (status, expected) => {
    expect(toPinDeleteErrorCode(new ApiError(status))).toBe(expected);
  });

  it("TypeError は network、その他は unknown", () => {
    expect(toPinDeleteErrorCode(new TypeError("x"))).toBe("network");
    expect(toPinDeleteErrorCode(new Error("x"))).toBe("unknown");
    expect(toPinDeleteErrorCode(null)).toBe("unknown");
  });
});

describe("文言", () => {
  it("全コードで文言が空でない", () => {
    for (const code of ALL_CODES) {
      expect(pinDeleteErrorMessage(code).length).toBeGreaterThan(0);
    }
  });

  it("forbidden は権限が無いことを伝える", () => {
    expect(pinDeleteErrorMessage("forbidden")).toBe("このピンを削除する権限がありません。");
  });

  it("確認ダイアログは取り消せないことを明示する", () => {
    expect(PIN_DELETE_DIALOG_TITLE).toBe("このピンを削除しますか？");
    expect(PIN_DELETE_DIALOG_DESCRIPTION).toContain("元に戻せません");
  });

  it("確認ボタンのラベルは実行中に変わる", () => {
    expect(pinDeleteConfirmLabel(false)).toBe("削除する");
    expect(pinDeleteConfirmLabel(true)).toBe("削除しています…");
  });
});

describe("canRetryPinDelete", () => {
  it("null と一時的な失敗は true、確定的な失敗は false", () => {
    expect(canRetryPinDelete(null)).toBe(true);
    expect(canRetryPinDelete("network")).toBe(true);
    expect(canRetryPinDelete("server")).toBe(true);
    expect(canRetryPinDelete("unknown")).toBe(true);
    expect(canRetryPinDelete("unauthorized")).toBe(false);
    expect(canRetryPinDelete("forbidden")).toBe(false);
    expect(canRetryPinDelete("invalid_request")).toBe(false);
  });
});
