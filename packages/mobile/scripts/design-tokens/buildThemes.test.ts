import { describe, expect, it } from "vitest";

import { buildThemes, type FileBlocks } from "./buildThemes";

describe("buildThemes", () => {
  it("light のみ定義されたトークンが dark にも引き継がれる(dark ブロックが無いファイル)", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "spacing",
        blocks: [{ selector: ":root", declarations: { "space-4": "16px" } }],
      },
    ];

    const { light, dark } = buildThemes(fileBlocks);

    expect(light.spacing["4"]).toBe(16);
    expect(dark.spacing["4"]).toBe(16);
  });

  it("dark で上書きされたトークンが dark 側でのみ変わる", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "colors",
        blocks: [
          {
            selector: ":root",
            declarations: { "surface-app": "#f5f7f9", "border-subtle": "#e2e6eb" },
          },
          { selector: '[data-theme="dark"]', declarations: { "surface-app": "#0f1621" } },
        ],
      },
    ];

    const { light, dark } = buildThemes(fileBlocks);

    expect(light.colors["surface-app"]).toBe("#f5f7f9");
    expect(dark.colors["surface-app"]).toBe("#0f1621");
    // 上書きされていないトークンは dark 側でも light の値を維持する
    expect(dark.colors["border-subtle"]).toBe("#e2e6eb");
    expect(light.colors["border-subtle"]).toBe("#e2e6eb");
  });

  it('spacing/radius/sizing で "16px" → 16 の数値化を行う', () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "spacing",
        blocks: [
          {
            selector: ":root",
            declarations: {
              "space-4": "16px",
              "radius-pill": "999px",
              "control-md": "44px",
              "space-0": "0",
            },
          },
        ],
      },
    ];

    const { light } = buildThemes(fileBlocks);

    expect(light.spacing["4"]).toBe(16);
    expect(light.radius.pill).toBe(999);
    expect(light.sizing["control-md"]).toBe(44);
    expect(light.spacing["0"]).toBe(0);
  });

  it("spacing/radius/sizing で px 以外の単位は例外を投げる", () => {
    const fileBlocks: FileBlocks[] = [
      { file: "spacing", blocks: [{ selector: ":root", declarations: { "space-4": "1rem" } }] },
    ];

    expect(() => buildThemes(fileBlocks)).toThrow(/px 以外の単位/);
  });

  it("typography.css の未知の接頭辞で例外を投げる", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "typography",
        blocks: [{ selector: ":root", declarations: { "unknown-token": "1" } }],
      },
    ];

    expect(() => buildThemes(fileBlocks)).toThrow(/未知のトークン接頭辞/);
  });

  it("spacing.css の未知の接頭辞で例外を投げる", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "spacing",
        blocks: [{ selector: ":root", declarations: { "unknown-token": "1px" } }],
      },
    ];

    expect(() => buildThemes(fileBlocks)).toThrow(/未知のトークン接頭辞/);
  });

  it("effects.css の未知の接頭辞で例外を投げる", () => {
    const fileBlocks: FileBlocks[] = [
      { file: "effects", blocks: [{ selector: ":root", declarations: { "unknown-token": "1" } }] },
    ];

    expect(() => buildThemes(fileBlocks)).toThrow(/未知のトークン接頭辞/);
  });

  it("typography.css の --font-* は fontFamily、それ以外は typography に振り分けられる", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "typography",
        blocks: [
          {
            selector: ":root",
            declarations: {
              "font-sans": '"Noto Sans", sans-serif',
              "text-md": "15px",
              "weight-bold": "700",
              "leading-normal": "1.55",
              "tracking-tight": "-0.01em",
            },
          },
        ],
      },
    ];

    const { light } = buildThemes(fileBlocks);

    expect(light.fontFamily.sans).toBe('"Noto Sans", sans-serif');
    expect(light.typography["text-md"]).toBe("15px");
    expect(light.typography["weight-bold"]).toBe("700");
    expect(light.typography["leading-normal"]).toBe("1.55");
    expect(light.typography["tracking-tight"]).toBe("-0.01em");
    // typography カテゴリには fontFamily のキーが混ざらない
    expect(light.typography["font-sans"]).toBeUndefined();
  });

  it("effects.css の shadow-* / ring-* / ease-* / dur-* をそれぞれ別カテゴリに振り分ける", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "effects",
        blocks: [
          {
            selector: ":root",
            declarations: {
              "shadow-md": "0 6px 18px rgba(27, 36, 48, 0.1)",
              "ring-focus": "0 0 0 3px rgba(21, 133, 254, 0.3)",
              "ease-spring": "cubic-bezier(0.34, 1.4, 0.5, 1)",
              "dur-fast": "120ms",
            },
          },
        ],
      },
    ];

    const { light } = buildThemes(fileBlocks);

    expect(light.shadow.md).toBe("0 6px 18px rgba(27, 36, 48, 0.1)");
    expect(light.ring.focus).toBe("0 0 0 3px rgba(21, 133, 254, 0.3)");
    expect(light.easing.spring).toBe("cubic-bezier(0.34, 1.4, 0.5, 1)");
    expect(light.duration.fast).toBe("120ms");
  });

  it("fonts.css にブロックが無ければ何も生成せず例外も投げない", () => {
    const fileBlocks: FileBlocks[] = [{ file: "fonts", blocks: [] }];

    expect(() => buildThemes(fileBlocks)).not.toThrow();
  });

  it("fonts.css にブロックが存在する場合(想定外)は例外を投げる", () => {
    const fileBlocks: FileBlocks[] = [
      { file: "fonts", blocks: [{ selector: ":root", declarations: { unexpected: "1" } }] },
    ];

    expect(() => buildThemes(fileBlocks)).toThrow(/fonts\.css/);
  });

  it("light/dark どちらにも一致しない未対応のセレクタで例外を投げる", () => {
    const fileBlocks: FileBlocks[] = [
      {
        file: "colors",
        blocks: [{ selector: ".unexpected-selector", declarations: { a: "#fff" } }],
      },
    ];

    expect(() => buildThemes(fileBlocks)).toThrow(/未対応のセレクタ/);
  });
});
