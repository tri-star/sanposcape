import { describe, expect, it } from "vitest";

import type { AuthSessionStatus } from "@/store/useAuthSessionStore";
import { canDeleteAccount, resolveSettingsSection } from "@/features/settings/lib/settingsSection";

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

describe("canDeleteAccount", () => {
  it("authenticated では true", () => {
    expect(canDeleteAccount("authenticated")).toBe(true);
  });

  it("guest では false（トークン非保持のため押しても必ず401になる）", () => {
    expect(canDeleteAccount("guest")).toBe(false);
  });

  it("loading では false（復元完了前に一瞬でも出さない）", () => {
    expect(canDeleteAccount("loading")).toBe(false);
  });

  it.each(["loading", "authenticated", "guest"] as AuthSessionStatus[])(
    "%s: resolveSettingsSection → canDeleteAccount の組み合わせは authenticated のときのみ true",
    (status) => {
      const section = resolveSettingsSection(status);
      expect(canDeleteAccount(section)).toBe(status === "authenticated");
    },
  );
});
