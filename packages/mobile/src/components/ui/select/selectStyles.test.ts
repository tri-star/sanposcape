import { describe, expect, it } from "vitest";

import {
  resolveSelectAppearance,
  resolveSelectDisplayLabel,
} from "@/components/ui/select/selectStyles";
import { darkTheme, lightTheme } from "@/theme/tokens";

const OPTIONS = [
  { value: "park", label: "公園" },
  { value: "cafe", label: "カフェ" },
];

describe("resolveSelectDisplayLabel", () => {
  it("値が無い場合は placeholder を返す", () => {
    expect(resolveSelectDisplayLabel(null, OPTIONS, "選択してください")).toBe("選択してください");
  });

  it("値がある場合は該当する label を返す", () => {
    expect(resolveSelectDisplayLabel("cafe", OPTIONS, "選択してください")).toBe("カフェ");
  });

  it("options に無い値は placeholder にフォールバックする", () => {
    expect(resolveSelectDisplayLabel("station", OPTIONS, "選択してください")).toBe(
      "選択してください",
    );
  });
});

describe("resolveSelectAppearance", () => {
  it.each([lightTheme, darkTheme])("disabled: false は surface 背景・通常文字色", (theme) => {
    const appearance = resolveSelectAppearance(theme, { disabled: false });
    expect(appearance.backgroundColor).toBe(theme.colors.surface);
    expect(appearance.textColor).toBe(theme.colors.text);
    expect(appearance.opacity).toBe(1);
  });

  it.each([lightTheme, darkTheme])("disabled: true は opacity が下がる", (theme) => {
    const appearance = resolveSelectAppearance(theme, { disabled: true });
    expect(appearance.opacity).toBeLessThan(1);
    expect(appearance.textColor).toBe(theme.colors.textDisabled);
  });

  it.each([lightTheme, darkTheme])(
    "borderWidth は Input と同じく常に hairline の1.5倍で固定",
    (theme) => {
      const expected = theme.sizing.hairline * 1.5;
      expect(resolveSelectAppearance(theme, { disabled: false }).borderWidth).toBe(expected);
      expect(resolveSelectAppearance(theme, { disabled: true }).borderWidth).toBe(expected);
    },
  );
});
