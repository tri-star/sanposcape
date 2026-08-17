import { describe, expect, it } from "vitest";

import { resolveSettingsSection } from "@/features/settings/lib/settingsSection";

describe("resolveSettingsSection", () => {
  it("loading のときは loading 節を返す（authenticated/guest どちらとも判定しない）", () => {
    expect(resolveSettingsSection("loading")).toBe("loading");
  });

  it("authenticated のときは authenticated 節を返す", () => {
    expect(resolveSettingsSection("authenticated")).toBe("authenticated");
  });

  it("guest のときは guest 節を返す", () => {
    expect(resolveSettingsSection("guest")).toBe("guest");
  });
});
