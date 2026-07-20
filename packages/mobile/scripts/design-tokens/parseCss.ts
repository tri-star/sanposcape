/**
 * CSS カスタムプロパティ抽出パーサ。
 *
 * Claude Design から取得する `design/tokens/*.css` は
 * 「セレクタ { --name: value; ... }」の平坦な構造(+ @media 等のアットルールでの入れ子)しか持たない。
 * ネストの深いセレクタや @supports 等は使われていないため、
 * 依存を増やさず正規表現/文字列走査ベースで実装する(postcss 等の CSS パーサライブラリは追加しない)。
 */

export type CssBlock = {
  /** セレクタ。例: ":root", "[data-theme='dark']", "@media (prefers-color-scheme: dark) :root" */
  selector: string;
  /** プロパティ名(先頭の -- を除く) → 生の値 */
  declarations: Record<string, string>;
};

/** ブロックコメント `/* ... *\/` を除去する(`/* @kind other *\/` のようなインラインアノテーションも含む) */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

/**
 * `body` (`{` と `}` の間の文字列)から `--name: value;` 形式の宣言のみを取り出す。
 * `--` で始まらない通常の CSS プロパティは無視する。
 */
function parseDeclarations(body: string): Record<string, string> {
  const declarations: Record<string, string> = {};

  for (const rawStatement of body.split(";")) {
    const statement = rawStatement.trim();
    if (statement === "" || !statement.startsWith("--")) {
      continue;
    }

    const colonIndex = statement.indexOf(":");
    if (colonIndex === -1) {
      continue;
    }

    const name = statement.slice(2, colonIndex).trim();
    const value = statement.slice(colonIndex + 1).trim();
    if (name === "" || value === "") {
      continue;
    }

    declarations[name] = value;
  }

  return declarations;
}

/** `openBraceIndex` の `{` に対応する `}` のインデックスを、波括弧の入れ子を数えて探す */
function findMatchingBrace(css: string, openBraceIndex: number): number {
  let depth = 0;
  for (let i = openBraceIndex; i < css.length; i++) {
    if (css[i] === "{") {
      depth++;
    } else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  throw new Error(`parseCss: 波括弧が閉じられていません(index ${openBraceIndex} 以降)`);
}

function combineSelector(parentSelector: string, selector: string): string {
  return parentSelector === "" ? selector : `${parentSelector} ${selector}`;
}

/**
 * `css` 中のトップレベルの `selector { ... }` ブロックを、@media 等のアットルールは
 * 再帰的に展開しながら抽出する。`parentSelector` は @media のプレリュードなどを連結するために使う。
 */
function parseBlocks(css: string, parentSelector: string): CssBlock[] {
  const blocks: CssBlock[] = [];

  let cursor = 0;
  while (cursor < css.length) {
    const openBraceIndex = css.indexOf("{", cursor);
    if (openBraceIndex === -1) {
      // 残りは `{` を含まない末尾のゴミ(空白 / `@import ...;` 等)。無視する。
      break;
    }

    const selectorRaw = css.slice(cursor, openBraceIndex).trim();
    const closeBraceIndex = findMatchingBrace(css, openBraceIndex);
    const body = css.slice(openBraceIndex + 1, closeBraceIndex);

    if (selectorRaw.startsWith("@")) {
      // @media 等のアットルール: 内側を再帰的に処理し、セレクタを連結する
      blocks.push(...parseBlocks(body, combineSelector(parentSelector, selectorRaw)));
    } else if (selectorRaw !== "") {
      blocks.push({
        selector: combineSelector(parentSelector, selectorRaw),
        declarations: parseDeclarations(body),
      });
    }

    cursor = closeBraceIndex + 1;
  }

  return blocks;
}

/**
 * CSS ソース文字列からカスタムプロパティのブロック一覧を抽出する。
 * `fonts.css` のように `@import` のみでブロックを持たないファイルは空配列を返す(例外にしない)。
 */
export function parseCss(source: string): CssBlock[] {
  const withoutComments = stripComments(source);
  return parseBlocks(withoutComments, "");
}
