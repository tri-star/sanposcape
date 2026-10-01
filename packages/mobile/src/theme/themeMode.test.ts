import { describe, expect, it } from "vitest";

import {
  DEFAULT_THEME_MODE,
  isThemeMode,
  statusBarStyleFor,
  THEME_MODES,
  toNativeColorScheme,
} from "@/theme/themeMode";
import { resolveTheme } from "@/theme/tokens";

describe("THEME_MODES / DEFAULT_THEME_MODE", () => {
  it("system / light / dark を重複なく含む", () => {
    expect(new Set(THEME_MODES).size).toBe(3);
    expect([...THEME_MODES].sort()).toEqual(["dark", "light", "system"]);
  });

  it("既定値は system（課題の要件）", () => {
    expect(DEFAULT_THEME_MODE).toBe("system");
  });
});

describe("isThemeMode", () => {
  it.each(["system", "light", "dark"])("%s は true", (value) => {
    expect(isThemeMode(value)).toBe(true);
  });

  it.each(["Dark", "", "auto", null, undefined, 1, {}])("%j は false", (value) => {
    expect(isThemeMode(value)).toBe(false);
  });
});

describe("toNativeColorScheme", () => {
  it("light / dark はそのまま、system は unspecified（null や auto を返さない）", () => {
    expect(toNativeColorScheme("light")).toBe("light");
    expect(toNativeColorScheme("dark")).toBe("dark");
    expect(toNativeColorScheme("system")).toBe("unspecified");
  });
});

describe("statusBarStyleFor", () => {
  it("暗いテーマでは明るいアイコン、明るいテーマでは暗いアイコン", () => {
    expect(statusBarStyleFor("dark")).toBe("light");
    expect(statusBarStyleFor("light")).toBe("dark");
  });
});

describe("resolveTheme との組み合わせ", () => {
  it("light / dark 選択中は上書き後の systemScheme と同じでも mode どおりになる", () => {
    expect(resolveTheme("dark", "dark").name).toBe("dark");
    expect(resolveTheme("light", "light").name).toBe("light");
  });
});
