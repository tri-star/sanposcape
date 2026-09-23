import { afterEach, describe, expect, it, vi } from "vitest";

import { describeError, logDiagnostic } from "@/lib/diagnosticLog";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logDiagnostic", () => {
  it("イベント名を接頭辞付きで、詳細をそのまま渡す", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    logDiagnostic("pin-photo.upload.rejected", { status: 403 });

    expect(warn).toHaveBeenCalledWith("[sanposcape] pin-photo.upload.rejected", { status: 403 });
  });
});

describe("describeError", () => {
  it("Error からは name と message を取り出す", () => {
    expect(describeError(new TypeError("Network request failed"))).toEqual({
      errorName: "TypeError",
      errorMessage: "Network request failed",
    });
  });

  it("中断とタイムアウトを name / message で見分けられる", () => {
    const aborted = new Error("Aborted");
    aborted.name = "AbortError";

    expect(describeError(aborted).errorName).toBe("AbortError");
    expect(describeError(new TypeError("Pin photo transfer timed out")).errorMessage).toBe(
      "Pin photo transfer timed out",
    );
  });

  it("Error でない値でも落ちない", () => {
    expect(describeError("boom")).toEqual({ errorName: "string", errorMessage: "boom" });
    expect(describeError(null)).toEqual({ errorName: "object", errorMessage: "null" });
  });
});
