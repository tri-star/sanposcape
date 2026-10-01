import { describe, expect, it } from "vitest";

import {
  THEME_MODE_DESCRIPTION,
  THEME_MODE_OPTIONS,
} from "@/features/settings/lib/themeModeOptions";
import { THEME_MODES } from "@/theme/themeMode";

describe("THEME_MODE_OPTIONS", () => {
  it("THEME_MODES を過不足なく・重複なく網羅する", () => {
    const values = THEME_MODE_OPTIONS.map((option) => option.value);
    expect(new Set(values).size).toBe(values.length);
    expect([...values].sort()).toEqual([...THEME_MODES].sort());
  });

  it("並びは ライト / ダーク / 端末の設定", () => {
    expect(THEME_MODE_OPTIONS.map((option) => option.value)).toEqual(["light", "dark", "system"]);
  });

  it("ラベルは空でなく重複しない", () => {
    const labels = THEME_MODE_OPTIONS.map((option) => option.label);
    expect(labels.every((label) => label.length > 0)).toBe(true);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("system のラベルは「端末の設定」で、説明文も同じ語を含む", () => {
    const system = THEME_MODE_OPTIONS.find((option) => option.value === "system");
    expect(system?.label).toBe("端末の設定");
    expect(THEME_MODE_DESCRIPTION).toContain(system?.label);
  });
});
