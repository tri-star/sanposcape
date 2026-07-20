import { describe, expect, it } from "vitest";

import { parseCss } from "./parseCss";

describe("parseCss", () => {
  it("単純な :root ブロックからカスタムプロパティを抽出できる", () => {
    const blocks = parseCss(":root { --a: 1px; }");

    expect(blocks).toEqual([{ selector: ":root", declarations: { a: "1px" } }]);
  });

  it("複数セレクタ・複数宣言を抽出できる", () => {
    const blocks = parseCss(`
      :root { --a: 1px; --b: 2px; }
      [data-theme="dark"] { --a: 3px; }
    `);

    expect(blocks).toEqual([
      { selector: ":root", declarations: { a: "1px", b: "2px" } },
      { selector: '[data-theme="dark"]', declarations: { a: "3px" } },
    ]);
  });

  it("ブロックコメントを除去してから解析する", () => {
    const blocks = parseCss(`
      /* header comment
         spans multiple lines */
      :root {
        /* inline comment */
        --a: 1px; /* trailing comment */
      }
    `);

    expect(blocks).toEqual([{ selector: ":root", declarations: { a: "1px" } }]);
  });

  it("effects.css の `/* @kind other */` アノテーションを無視できる", () => {
    const blocks = parseCss(`
      :root {
        --ease-out: cubic-bezier(0.22, 0.61, 0.36, 1); /* @kind other */
        --dur-fast: 120ms; /* @kind other */
      }
    `);

    expect(blocks).toEqual([
      {
        selector: ":root",
        declarations: {
          "ease-out": "cubic-bezier(0.22, 0.61, 0.36, 1)",
          "dur-fast": "120ms",
        },
      },
    ]);
  });

  it("-- で始まらない通常の CSS プロパティは無視する", () => {
    const blocks = parseCss(":root { color: red; --a: 1px; }");

    expect(blocks).toEqual([{ selector: ":root", declarations: { a: "1px" } }]);
  });

  it("@media (prefers-color-scheme: dark) のネストを展開できる", () => {
    const blocks = parseCss(`
      @media (prefers-color-scheme: dark) {
        :root { --a: 1px; }
      }
    `);

    expect(blocks).toEqual([
      { selector: "@media (prefers-color-scheme: dark) :root", declarations: { a: "1px" } },
    ]);
  });

  it("空文字列で例外を投げず空配列を返す", () => {
    expect(parseCss("")).toEqual([]);
  });

  it("宣言のないブロックで落ちない", () => {
    expect(parseCss(":root {}")).toEqual([{ selector: ":root", declarations: {} }]);
  });

  it("@import のみで波括弧を持たない CSS(fonts.css 相当)で空配列を返す", () => {
    const source = `@import url('https://fonts.googleapis.com/css2?family=Noto+Sans');`;

    expect(parseCss(source)).toEqual([]);
  });
});
