import { describe, expect, it } from "vitest";

import { SanpoMapIcon } from "@/api/generated/model";
import { SANPO_MAP_ICON_ART } from "@/features/pin/data/sanpoMapIconArt";

describe("SANPO_MAP_ICON_ART", () => {
  it("API の enum を網羅している", () => {
    expect(new Set(Object.keys(SANPO_MAP_ICON_ART))).toEqual(new Set(Object.values(SanpoMapIcon)));
  });

  it.each(Object.entries(SANPO_MAP_ICON_ART))(
    "%s は viewBox を持つ1つの svg 要素で、大きさの指定・style 属性・外部参照を含まない",
    (_key, svg) => {
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 128 128"[^>]*>.*<\/svg>$/s);
      expect(svg).not.toMatch(/<svg [^>]*\b(width|height)=/);
      expect(svg).not.toContain("style=");
      expect(svg).not.toMatch(/href="(?!#)/);
    },
  );
});
