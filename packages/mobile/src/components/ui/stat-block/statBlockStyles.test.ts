import { describe, expect, it } from "vitest";

import { resolveStatBlockAppearance } from "@/components/ui/stat-block/statBlockStyles";
import { lightTheme } from "@/theme/tokens";

describe("resolveStatBlockAppearance", () => {
  it("size: lg は theme.typography.data を使う(tabular-nums 付き)", () => {
    const appearance = resolveStatBlockAppearance(lightTheme, { size: "lg", align: "left" });
    expect(appearance.valueTextStyle).toEqual(lightTheme.typography.data);
    expect(appearance.valueTextStyle.fontVariant).toEqual(["tabular-nums"]);
  });

  it("size: md は theme.typography.dataSm を使う(tabular-nums 付き)", () => {
    const appearance = resolveStatBlockAppearance(lightTheme, { size: "md", align: "left" });
    expect(appearance.valueTextStyle).toEqual(lightTheme.typography.dataSm);
    expect(appearance.valueTextStyle.fontVariant).toEqual(["tabular-nums"]);
  });

  it("dataSm は DS 実寸の text-2xl(以前は text-lg で DS と不一致だった)", () => {
    expect(lightTheme.typography.dataSm.fontSize).toBe(24);
  });

  it("unit は theme.typography.dataUnit を使う(font-data/weight-medium)", () => {
    const appearance = resolveStatBlockAppearance(lightTheme, { size: "lg", align: "left" });
    expect(appearance.unitTextStyle).toEqual(lightTheme.typography.dataUnit);
    expect(appearance.unitTextStyle.fontWeight).toBe(lightTheme.typography.label.fontWeight);
  });

  it("lg の fontSize が md より大きい", () => {
    const lg = resolveStatBlockAppearance(lightTheme, { size: "lg", align: "left" });
    const md = resolveStatBlockAppearance(lightTheme, { size: "md", align: "left" });
    expect(lg.valueTextStyle.fontSize).toBeGreaterThan(md.valueTextStyle.fontSize);
  });

  it("align: center で alignItems/textAlign が center になる", () => {
    const appearance = resolveStatBlockAppearance(lightTheme, { size: "lg", align: "center" });
    expect(appearance.alignItems).toBe("center");
    expect(appearance.textAlign).toBe("center");
  });

  it("align: left で alignItems が flex-start", () => {
    const appearance = resolveStatBlockAppearance(lightTheme, { size: "lg", align: "left" });
    expect(appearance.alignItems).toBe("flex-start");
    expect(appearance.textAlign).toBe("left");
  });
});
