import { describe, expect, it } from "vitest";

import { resolveMapRenderer } from "@/config/mapRenderer";

describe("resolveMapRenderer", () => {
  it("Android はキーの有無の印によらず Google Maps", () => {
    expect(resolveMapRenderer({ platformOs: "android", iosGoogleMaps: undefined })).toBe("google");
    expect(resolveMapRenderer({ platformOs: "android", iosGoogleMaps: false })).toBe("google");
  });

  it("iOS は iosGoogleMaps が true のビルドだけ Google Maps", () => {
    expect(resolveMapRenderer({ platformOs: "ios", iosGoogleMaps: true })).toBe("google");
  });

  it("iOS で印が無い・false・true 以外の値なら Apple Maps に倒す（pod の無いビルドで地図を壊さない）", () => {
    for (const value of [undefined, null, false, "true", 1]) {
      expect(resolveMapRenderer({ platformOs: "ios", iosGoogleMaps: value })).toBe("apple");
    }
  });
});
