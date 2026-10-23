import { describe, expect, it } from "vitest";

import { APP_VERSION_UNKNOWN, formatAppVersion } from "@/features/settings/lib/appVersionLabel";

describe("formatAppVersion", () => {
  it("バージョンをそのまま出す（接頭辞を付けない）", () => {
    expect(formatAppVersion("1.0.0")).toBe("1.0.0");
  });

  it("null は「不明」", () => {
    expect(formatAppVersion(null)).toBe(APP_VERSION_UNKNOWN);
  });

  it("空・空白だけは「不明」、前後の空白は落とす", () => {
    expect(formatAppVersion("")).toBe(APP_VERSION_UNKNOWN);
    expect(formatAppVersion("  ")).toBe(APP_VERSION_UNKNOWN);
    expect(formatAppVersion(" 1.2.3 ")).toBe("1.2.3");
  });
});
