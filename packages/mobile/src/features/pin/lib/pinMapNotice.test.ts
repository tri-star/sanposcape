import { describe, expect, it } from "vitest";

import { resolvePinMapNotice } from "@/features/pin/lib/pinMapNotice";

const READY_INPUT = {
  isSignedIn: true,
  status: "ready" as const,
  errorCode: null,
  truncated: false,
  pinCount: 3,
};

describe("resolvePinMapNotice", () => {
  it("未サインインは sign-in（error より優先）", () => {
    expect(
      resolvePinMapNotice({
        ...READY_INPUT,
        isSignedIn: false,
        status: "error",
        errorCode: "server",
      }),
    ).toEqual({ kind: "sign-in" });
  });

  it("status error は error（errorCode を保持）", () => {
    expect(resolvePinMapNotice({ ...READY_INPUT, status: "error", errorCode: "network" })).toEqual({
      kind: "error",
      code: "network",
      retriable: true,
    });
  });

  it("status error で errorCode が null なら unknown 扱い", () => {
    expect(resolvePinMapNotice({ ...READY_INPUT, status: "error", errorCode: null })).toEqual({
      kind: "error",
      code: "unknown",
      retriable: true,
    });
  });

  it("再試行不可なエラー（not_found）は retriable false", () => {
    expect(
      resolvePinMapNotice({ ...READY_INPUT, status: "error", errorCode: "not_found" }),
    ).toEqual({ kind: "error", code: "not_found", retriable: false });
  });

  it("status loading は loading（truncated/empty より優先）", () => {
    expect(
      resolvePinMapNotice({ ...READY_INPUT, status: "loading", truncated: true, pinCount: 0 }),
    ).toEqual({ kind: "loading" });
  });

  it("truncated は empty より優先", () => {
    expect(resolvePinMapNotice({ ...READY_INPUT, truncated: true, pinCount: 0 })).toEqual({
      kind: "truncated",
    });
  });

  it("0件は empty", () => {
    expect(resolvePinMapNotice({ ...READY_INPUT, pinCount: 0 })).toEqual({ kind: "empty" });
  });

  it("それ以外は none", () => {
    expect(resolvePinMapNotice(READY_INPUT)).toEqual({ kind: "none" });
  });
});
