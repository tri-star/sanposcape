import { describe, expect, it } from "vitest";

import { resolveVars } from "./resolveVars";

describe("resolveVars", () => {
  it("単純なエイリアスを解決する", () => {
    const result = resolveVars({ a: "var(--b)", b: "16px" });

    expect(result).toEqual({ a: "16px", b: "16px" });
  });

  it("多段(3段以上)のエイリアスを解決する", () => {
    const result = resolveVars({
      a: "var(--b)",
      b: "var(--c)",
      c: "var(--d)",
      d: "#1585fe",
    });

    expect(result).toEqual({ a: "#1585fe", b: "#1585fe", c: "#1585fe", d: "#1585fe" });
  });

  it("1つの値に複数の var() が含まれる場合を全て置換する", () => {
    const result = resolveVars({
      shadow: "0 6px 18px var(--shadow-color), 0 1px 2px var(--shadow-color-strong)",
      "shadow-color": "rgba(27, 36, 48, 0.1)",
      "shadow-color-strong": "rgba(27, 36, 48, 0.2)",
    });

    expect(result.shadow).toBe("0 6px 18px rgba(27, 36, 48, 0.1), 0 1px 2px rgba(27, 36, 48, 0.2)");
  });

  it("フォールバック付き var(--x, #fff) で --x が未定義なら fallback を使う", () => {
    const result = resolveVars({ a: "var(--undefined-token, #fff)" });

    expect(result.a).toBe("#fff");
  });

  it("フォールバックの中に var() が含まれていても解決する", () => {
    const result = resolveVars({
      a: "var(--undefined-token, var(--b))",
      b: "8px",
    });

    expect(result.a).toBe("8px");
  });

  it("循環参照があると例外を投げる", () => {
    expect(() => resolveVars({ a: "var(--b)", b: "var(--a)" })).toThrow(/循環参照/);
  });

  it("未定義の var() でフォールバックも無ければ例外を投げる", () => {
    expect(() => resolveVars({ a: "var(--undefined-token)" })).toThrow(/未定義/);
  });

  it("fallbackScope から解決できる", () => {
    const result = resolveVars({ a: "var(--b)" }, { b: "24px" });

    expect(result.a).toBe("24px");
  });

  it("同名の場合 declarations が fallbackScope より優先される", () => {
    const result = resolveVars({ a: "var(--b)", b: "declarations-value" }, { b: "fallback-value" });

    expect(result.a).toBe("declarations-value");
  });

  it("var() を含まない値はそのまま返す", () => {
    const result = resolveVars({ a: "1px solid #000" });

    expect(result.a).toBe("1px solid #000");
  });

  it("解決の深さが上限(20)を超えると例外を投げる", () => {
    // 中間の変数を fallbackScope 側に置き、declarations 側は起点の1つだけにすることで、
    // (トップレベルのループによる事前キャッシュに邪魔されず)実際に深い再帰を発生させる。
    const fallbackScope: Record<string, string> = { v0: "0px" };
    for (let i = 1; i <= 25; i++) {
      fallbackScope[`v${i}`] = `var(--v${i - 1})`;
    }

    expect(() => resolveVars({ a: "var(--v25)" }, fallbackScope)).toThrow(/解決の深さ/);
  });
});
