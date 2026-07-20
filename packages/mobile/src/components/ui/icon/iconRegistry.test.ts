import { describe, expect, it } from "vitest";

import { ICON_REGISTRY, isIconName } from "@/components/ui/icon/iconRegistry";

describe("isIconName", () => {
  it("既知の名前は true", () => {
    expect(isIconName("home")).toBe(true);
    expect(isIconName("map-pin")).toBe(true);
  });

  it("未知の名前は false", () => {
    expect(isIconName("does-not-exist")).toBe(false);
    expect(isIconName("")).toBe(false);
  });
});

describe("ICON_REGISTRY", () => {
  it("全エントリが truthy(import 漏れがない)", () => {
    for (const [name, component] of Object.entries(ICON_REGISTRY)) {
      expect(component, `${name} が未定義です`).toBeTruthy();
    }
  });

  it("全キーが kebab-case(Lucide の実名に合わせ末尾の数字は許容する。例: check-circle-2)", () => {
    const kebabCasePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const name of Object.keys(ICON_REGISTRY)) {
      expect(name).toMatch(kebabCasePattern);
    }
  });
});
