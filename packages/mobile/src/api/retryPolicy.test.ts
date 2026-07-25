import { describe, expect, it } from "vitest";

import { shouldRefreshAndRetry } from "@/api/retryPolicy";

describe("shouldRefreshAndRetry", () => {
  it("401 かつ トークン送信済み かつ 未リトライ なら true", () => {
    expect(shouldRefreshAndRetry({ status: 401, hadToken: true, alreadyRetried: false })).toBe(
      true,
    );
  });

  it("401 でも hadToken=false なら false", () => {
    expect(shouldRefreshAndRetry({ status: 401, hadToken: false, alreadyRetried: false })).toBe(
      false,
    );
  });

  it("401 でも alreadyRetried=true なら false", () => {
    expect(shouldRefreshAndRetry({ status: 401, hadToken: true, alreadyRetried: true })).toBe(
      false,
    );
  });

  it.each([403, 500, 200])("status=%i なら false", (status) => {
    expect(shouldRefreshAndRetry({ status, hadToken: true, alreadyRetried: false })).toBe(false);
  });
});
