import type { CssBlock } from "./parseCss";

/**
 * トークンの取得元ファイル。`design/tokens/*.css` の1ファイルにつき1つ。
 * どのカテゴリに振り分けるかは「ファイル + トークン名の接頭辞」で決める。
 *
 * 【プランからの補正】実データでは `colors.css` の `--text-primary`(文字色)と
 * `typography.css` の `--text-2xs`(文字サイズ)のように、異なるファイルで同じ接頭辞
 * (`text-`)が別の意味で使われている。ファイル横断でトークン名の接頭辞だけを見て
 * 分類すると誤分類が起きるため、`buildThemes` は「どのファイル由来か」を先に確定させた
 * 上で、ファイルごとに定義された接頭辞ルールを適用する。
 */
export type TokenFile = "colors" | "typography" | "spacing" | "effects" | "fonts";

export type ThemeMode = "light" | "dark";

/** 1ファイル分の `CssBlock[]`(var() 解決済み) */
export type FileBlocks = {
  file: TokenFile;
  blocks: CssBlock[];
};

/**
 * DS の primitive 値をそのまま保持する生成テーマ。
 * 用途名(semantic)へのマッピングは Phase 1 の `src/theme/tokens.ts` の責務。
 *
 * 【プランからの補正】実データを反映し、当初案の `radius`/`spacing` のみの構造から
 * `sizing`(コントロール高さ・レイアウト定数)/`ring`(フォーカスリング。現在は未使用だが
 * DS に定義があるため生成はする)/`easing`・`duration`(motion を2軸に分割)を追加した。
 * 値の型変換(px→number)は spacing/radius/sizing のみで行い、それ以外(typography の
 * 行高・字間・shadow の文字列・easing の cubic-bezier・duration の ms)は生の文字列の
 * まま保持し、RN 向けの変換は `src/theme/adapters/`(Phase 1)に委ねる。
 */
export type GeneratedTheme = {
  /** 色。ブランド primitive・ニュートラル・セマンティックエイリアス・地図・イラストを区別せず全て含む */
  colors: Record<string, string>;
  /** 4px グリッドの余白。px 数値化済み */
  spacing: Record<string, number>;
  /** 角丸。px 数値化済み(pill は 999) */
  radius: Record<string, number>;
  /** コントロール高さ・ページ余白・タブバー高さ等。px 数値化済み */
  sizing: Record<string, number>;
  /** フォントファミリ文字列(`--font-*`) */
  fontFamily: Record<string, string>;
  /** 文字サイズ・太さ・行高・字間の生値(単位変換は adapters 側) */
  typography: Record<string, string>;
  /** box-shadow の生文字列(`--shadow-*`) */
  shadow: Record<string, string>;
  /** フォーカスリング用の box-shadow 生文字列(`--ring-*`)。現状 UI では未使用 */
  ring: Record<string, string>;
  /** cubic-bezier(...) の生文字列(`--ease-*`) */
  easing: Record<string, string>;
  /** 時間の生文字列(例: "120ms")(`--dur-*`) */
  duration: Record<string, string>;
};

type GeneratedThemeCategory = keyof GeneratedTheme;

/** `spacing.css` の中で "スペーシング/角丸" のどちらでもない、個別のサイズトークン */
const SIZING_TOKEN_NAMES = new Set([
  "control-sm",
  "control-md",
  "control-lg",
  "page-gutter",
  "tabbar-height",
  "safe-top",
  "hairline",
]);

function emptyTheme(): GeneratedTheme {
  return {
    colors: {},
    spacing: {},
    radius: {},
    sizing: {},
    fontFamily: {},
    typography: {},
    shadow: {},
    ring: {},
    easing: {},
    duration: {},
  };
}

/** `"16px"` → `16` / `"0"` → `0`。px 以外の単位、または数値化できない値は例外にする */
function parsePx(value: string, tokenName: string): number {
  if (value === "0") {
    return 0;
  }
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) {
    throw new Error(`buildThemes: px 以外の単位です(--${tokenName}): "${value}"`);
  }
  return Number(match[1]);
}

type ClassifiedToken = { category: GeneratedThemeCategory; key: string; value: string | number };

/** ファイル + トークン名の接頭辞からカテゴリと出力キーを決める。未知の接頭辞は例外にする */
function classifyToken(file: TokenFile, name: string, value: string): ClassifiedToken {
  switch (file) {
    case "colors": {
      // colors.css の全トークンはそのままカテゴリ colors へ。用途別の意味づけは Phase 1 が行う。
      return { category: "colors", key: name, value };
    }
    case "typography": {
      if (name.startsWith("font-")) {
        return { category: "fontFamily", key: name.slice("font-".length), value };
      }
      if (
        name.startsWith("text-") ||
        name.startsWith("weight-") ||
        name.startsWith("leading-") ||
        name.startsWith("tracking-")
      ) {
        return { category: "typography", key: name, value };
      }
      throw new Error(`buildThemes: 未知のトークン接頭辞です(typography.css): --${name}`);
    }
    case "spacing": {
      if (name.startsWith("space-")) {
        return {
          category: "spacing",
          key: name.slice("space-".length),
          value: parsePx(value, name),
        };
      }
      if (name.startsWith("radius-")) {
        return {
          category: "radius",
          key: name.slice("radius-".length),
          value: parsePx(value, name),
        };
      }
      if (SIZING_TOKEN_NAMES.has(name)) {
        return { category: "sizing", key: name, value: parsePx(value, name) };
      }
      throw new Error(`buildThemes: 未知のトークン接頭辞です(spacing.css): --${name}`);
    }
    case "effects": {
      if (name.startsWith("shadow-")) {
        return { category: "shadow", key: name.slice("shadow-".length), value };
      }
      if (name.startsWith("ring-")) {
        return { category: "ring", key: name.slice("ring-".length), value };
      }
      if (name.startsWith("ease-")) {
        return { category: "easing", key: name.slice("ease-".length), value };
      }
      if (name.startsWith("dur-")) {
        return { category: "duration", key: name.slice("dur-".length), value };
      }
      throw new Error(`buildThemes: 未知のトークン接頭辞です(effects.css): --${name}`);
    }
    case "fonts": {
      // fonts.css は @import のみでトークンを持たない想定。ここに来ること自体が想定外。
      throw new Error(`buildThemes: fonts.css には未対応のトークン --${name} が定義されています`);
    }
  }
}

function applyDeclarations(
  theme: GeneratedTheme,
  file: TokenFile,
  declarations: Record<string, string>,
): void {
  for (const [name, value] of Object.entries(declarations)) {
    const classified = classifyToken(file, name, value);
    (theme[classified.category] as Record<string, string | number>)[classified.key] =
      classified.value;
  }
}

function isDarkSelector(selector: string): boolean {
  return selector.toLowerCase().includes("dark");
}

function isLightSelector(selector: string): boolean {
  return selector === "html" || selector.includes(":root");
}

/**
 * 解決済みの `CssBlock[]`(ファイルごと)を、light / dark × カテゴリ別の
 * `GeneratedTheme` に組み立てる。
 *
 * light/dark の判定:
 * - dark: セレクタに "dark" を含むもの(実データでは `[data-theme="dark"]`)
 * - light: `:root` を含む、または `html`
 * - どちらにも一致しないセレクタは例外にする(想定外の DS 変更を検知するため)
 *
 * dark はライト値からの差分としてマージする(`dark = { ...light, ...darkOverrides }`)。
 * `typography.css` / `spacing.css` のように dark 用ブロックが存在しないファイルは、
 * light の値がそのまま dark にも引き継がれる。
 */
export function buildThemes(fileBlocksList: FileBlocks[]): {
  light: GeneratedTheme;
  dark: GeneratedTheme;
} {
  const light = emptyTheme();
  const dark = emptyTheme();

  for (const { file, blocks } of fileBlocksList) {
    if (file === "fonts") {
      if (blocks.length > 0) {
        throw new Error(
          "buildThemes: fonts.css にカスタムプロパティのブロックが見つかりました。" +
            "fonts.css は @import のみを想定しているため、codegen の対象外です。",
        );
      }
      continue;
    }

    let lightDeclarations: Record<string, string> = {};
    let darkOverrides: Record<string, string> = {};
    let hasDarkBlock = false;

    for (const block of blocks) {
      if (isDarkSelector(block.selector)) {
        hasDarkBlock = true;
        darkOverrides = { ...darkOverrides, ...block.declarations };
      } else if (isLightSelector(block.selector)) {
        lightDeclarations = { ...lightDeclarations, ...block.declarations };
      } else {
        throw new Error(`buildThemes: 未対応のセレクタです(${file}.css): "${block.selector}"`);
      }
    }

    applyDeclarations(light, file, lightDeclarations);
    const mergedForDark = hasDarkBlock
      ? { ...lightDeclarations, ...darkOverrides }
      : lightDeclarations;
    applyDeclarations(dark, file, mergedForDark);
  }

  return { light, dark };
}
