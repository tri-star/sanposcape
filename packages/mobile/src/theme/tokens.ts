/**
 * デザイントークン（semantic 層）。
 *
 * `generated/tokens.generated.ts`(Claude Design からの自動生成・primitive 値。
 * キーは DS の CSS 変数名そのままの kebab-case)を、`adapters/` の純粋変換関数で
 * RN 向けに変換しつつ、**用途名(camelCase)** にマッピングする。
 * コンポーネントは必ずこのファイルが export する `lightTheme` / `darkTheme` のみを参照し、
 * `generated/` を直接 import しない。
 *
 * 【意図的に semantic へ写さないもの】
 * - `--ill-*`(イラスト用パレット, 9個, light専用): IllustrationSlot は
 *   「tint パネル + Lucide アイコン」方式を採用する決定のため、semantic 名を割り当てない。
 *   （生成はされるが未参照のまま。詳細は docs/design-tokens.md）
 * - `overlay`(モーダル/シートの背景スクリム): DS の colors.css に対応するトークンが
 *   定義されていないため、今回は追加しない。Dialog/BottomSheet 実装時（Phase 3/4）に
 *   DS を再確認して追加する。
 */
import {
  generatedDarkTokens,
  generatedLightTokens,
  type GeneratedTokens,
} from "./generated/tokens.generated";
import {
  parseCubicBezier,
  toBoxShadow,
  toDurationMs,
  toTextStyle,
  type TextStyleToken,
} from "./adapters";

/**
 * `generated/tokens.generated.ts` は `as const` で light/dark それぞれの値が
 * リテラル型として固定されている(例: `accent-hover` は light と dark で異なる文字列
 * リテラル型)。light/dark 共通の1つの構築関数に両方を渡せるようにするため、
 * 文字列/数値のリテラル型を幅広い `string`/`number` に均す。
 */
type Widen<T> = T extends readonly (infer U)[]
  ? readonly Widen<U>[]
  : T extends string
    ? string
    : T extends number
      ? number
      : T extends object
        ? { readonly [K in keyof T]: Widen<T[K]> }
        : T;

type WidenedGeneratedTokens = Widen<GeneratedTokens>;
type GeneratedColors = WidenedGeneratedTokens["colors"];
type GeneratedTypography = WidenedGeneratedTokens["typography"];

/** `"24px"` → `24`。typography.css の text-* は必ず px 指定のため単位以外は例外にする */
function parsePx(value: string): number {
  const match = /^(-?\d+(?:\.\d+)?)px$/.exec(value);
  if (!match) {
    throw new Error(`tokens: フォントサイズの単位が px ではありません: "${value}"`);
  }
  return Number(match[1]);
}

function buildColors(colors: GeneratedColors) {
  return {
    // --- サーフェス ---
    background: colors["surface-app"],
    surface: colors["surface-card"],
    surfaceElevated: colors["surface-raised"],
    surfaceSunken: colors["surface-sunken"],
    surfaceTint: colors["surface-tint"],
    surfaceTintStrong: colors["surface-tint-strong"],
    surfaceInverse: colors["surface-inverse"],

    // --- テキスト ---
    text: colors["text-primary"],
    textMuted: colors["text-secondary"],
    textTertiary: colors["text-tertiary"],
    textDisabled: colors["text-disabled"],
    textOnPrimary: colors["text-on-primary"],
    textLink: colors["text-link"],

    // --- 枠線 ---
    border: colors["border-subtle"],
    borderStrong: colors["border-strong"],
    borderFocus: colors["border-focus"],
    divider: colors["border-subtle"],
    /** ProgressBar のトラック等、枠線より一段薄い塗り(DS の `--ink-100`)。border(`--ink-200`)とは別値 */
    neutralFill: colors["ink-100"],
    /**
     * Dialog/BottomSheet の背面スクリム。DS 実物(design/components/DS-COMPONENT-SPECS.md の
     * Dialog 表)が固定値 `rgba(27, 36, 48, 0.45)` を返しており、light/dark で変わらない
     * (影を意図的に純黒へ切り替える dark の規律とは異なり、スクリムは theme非依存)。
     * 以前は `surfaceInverse + 固定alpha` で代用していたが、dark の `surfaceInverse` は
     * ほぼ白(`#eef1f4`)のため誤り(C-6 でも重複していた `OVERLAY_ALPHA` を統合)。
     */
    overlay: "rgba(27, 36, 48, 0.45)",

    // --- ブランド ---
    primary: colors.primary,
    primaryHover: colors["primary-hover"],
    primaryPressed: colors["primary-press"],
    primaryTint: colors["primary-tint"],
    /** Button secondary 押下時用(DS の `--blue-300`)。secondary の既定背景は primaryTint */
    secondaryPressed: colors["blue-300"],
    onPrimary: colors["on-primary"],
    accent: colors.accent,
    accentHover: colors["accent-hover"],
    accentTint: colors["accent-tint"],

    // --- セマンティック状態(装飾には使わない) ---
    danger: colors.danger,
    dangerTint: colors["danger-tint"],
    /** Button danger 押下時の「暗くする」表現用(DS の `--red-600`)。B-3 対応 */
    dangerPressed: colors["red-600"],
    success: colors.success,
    successTint: colors["success-tint"],
    warning: colors.warning,
    warningTint: colors["warning-tint"],
    info: colors.info,
    infoTint: colors["info-tint"],

    /** 地図ピン・タグのカテゴリ色。装飾には使わない */
    category: {
      park: colors["map-park"],
      cafe: colors["map-cafe"],
      culture: colors["map-culture"],
      station: colors["map-station"],
    },

    /** 地図描画用の色。primitive を装飾目的で流用しない */
    map: {
      canvas: colors["map-canvas"],
      road: colors["map-road"],
      route: colors["map-route"],
      water: colors["map-water"],
      greenspace: colors["map-greenspace"],
    },
  } as const;
}

/** DS の 4px グリッド(`--space-*`)を、px 値そのものをキーにした引きやすい形に写す */
function buildSpacing(spacing: WidenedGeneratedTokens["spacing"]) {
  return {
    0: spacing["0"],
    4: spacing["1"],
    8: spacing["2"],
    12: spacing["3"],
    16: spacing["4"],
    20: spacing["5"],
    24: spacing["6"],
    32: spacing["8"],
    40: spacing["10"],
    48: spacing["12"],
    64: spacing["16"],
  } as const;
}

function buildRadius(radius: WidenedGeneratedTokens["radius"]) {
  return {
    xs: radius.xs,
    sm: radius.sm,
    /**
     * コントロールの既定角丸。Input/Select の枠はこれを使う(D-2。以前のコメントは
     * 「Input/Button 以外」と誤記していたが、実際には Input が使用している。
     * Button/Tag/Badge/IconButton は常に `pill` を使う)。
     */
    md: radius.md,
    /** カードの既定角丸 */
    lg: radius.lg,
    /** ヒーローカード・BottomSheet の角丸 */
    xl: radius.xl,
    /** ボタン・タグは常にこれ */
    pill: radius.pill,
  } as const;
}

function buildSizing(sizing: WidenedGeneratedTokens["sizing"]) {
  return {
    controlSm: sizing["control-sm"],
    controlMd: sizing["control-md"],
    controlLg: sizing["control-lg"],
    pageGutter: sizing["page-gutter"],
    tabbarHeight: sizing["tabbar-height"],
    safeTop: sizing["safe-top"],
    hairline: sizing.hairline,
  } as const;
}

function buildShadow(shadow: WidenedGeneratedTokens["shadow"]) {
  return {
    xs: toBoxShadow(shadow.xs),
    sm: toBoxShadow(shadow.sm),
    md: toBoxShadow(shadow.md),
    lg: toBoxShadow(shadow.lg),
    sheet: toBoxShadow(shadow.sheet),
    pin: toBoxShadow(shadow.pin),
  } as const;
}

function buildMotion(
  easing: WidenedGeneratedTokens["easing"],
  duration: WidenedGeneratedTokens["duration"],
) {
  return {
    fast: { durationMs: toDurationMs(duration.fast), bezier: parseCubicBezier(easing["in-out"]) },
    base: { durationMs: toDurationMs(duration.base), bezier: parseCubicBezier(easing.out) },
    slow: { durationMs: toDurationMs(duration.slow), bezier: parseCubicBezier(easing.out) },
    /** BottomSheet 等の springy なモーション用(`ease-spring 320ms`) */
    spring: { durationMs: toDurationMs(duration.slow), bezier: parseCubicBezier(easing.spring) },
  } as const;
}

type TypographyRoleConfig = {
  sizeKey: keyof GeneratedTypography;
  weightKey: keyof GeneratedTypography;
  leadingKey: keyof GeneratedTypography;
  trackingKey?: keyof GeneratedTypography;
  fontFamilyKey: keyof WidenedGeneratedTokens["fontFamily"];
  tabularNums?: boolean;
};

/** semantic な typography ロール名。コンポーネントは `theme.typography.<role>` で参照する */
type TypographyRoleName =
  | "display"
  | "heading"
  | "headingSm"
  | "title"
  | "body"
  | "bodySm"
  | "caption"
  | "label"
  | "data"
  | "dataSm"
  | "dataUnit"
  | "badgeLabel";

/**
 * 用途名 → (サイズ/太さ/行高/字間/フォント) の組み立て表。
 * DS の `guidelines/type-scale.card.html` と照合済み(6ロールの実際の用途割り当てを確認した)。
 * `data`(4xl/heavy/font-data)・`heading`(2xl相当の補間ロール)・`headingSm`(xl/bold)・
 * `body`(md/regular)・`label`(sm/medium/font-label)・`caption`(xs) は DS のカード記載と一致。
 * `display` は DS が 4xl+heavy を数値表示(`data`)専用としているため、DS が画面見出しとして
 * 明示する `3xl/bold` に振り直した(4xl+heavy を見出しにも使うと `data` と寸法が重複するため)。
 * `title`/`bodySm`/`dataSm` は DS のカードに直接の記載がないが、スケールに存在する値を用いた
 * 補間ロールとして維持する。
 */
const TYPOGRAPHY_ROLES: Record<TypographyRoleName, TypographyRoleConfig> = {
  /** 画面見出し(例: 「ゴール：川辺駅」)。DS の `3xl / bold` */
  display: {
    sizeKey: "text-3xl",
    weightKey: "weight-bold",
    leadingKey: "leading-tight",
    fontFamilyKey: "heading",
  },
  /** 画面見出し */
  heading: {
    sizeKey: "text-2xl",
    weightKey: "weight-bold",
    leadingKey: "leading-snug",
    fontFamilyKey: "heading",
  },
  /** セクション見出し */
  headingSm: {
    sizeKey: "text-xl",
    weightKey: "weight-bold",
    leadingKey: "leading-snug",
    fontFamilyKey: "heading",
  },
  /** カードタイトル等 */
  title: {
    sizeKey: "text-lg",
    weightKey: "weight-medium",
    leadingKey: "leading-snug",
    fontFamilyKey: "heading",
  },
  /** 標準本文 */
  body: {
    sizeKey: "text-md",
    weightKey: "weight-regular",
    leadingKey: "leading-normal",
    fontFamilyKey: "body",
  },
  /** 小さめの本文・補助テキスト */
  bodySm: {
    sizeKey: "text-sm",
    weightKey: "weight-regular",
    leadingKey: "leading-normal",
    fontFamilyKey: "body",
  },
  /** キャプション・注釈 */
  caption: {
    sizeKey: "text-xs",
    weightKey: "weight-regular",
    leadingKey: "leading-normal",
    fontFamilyKey: "body",
  },
  /** ボタン・タグ・フォームラベル */
  label: {
    sizeKey: "text-sm",
    weightKey: "weight-medium",
    leadingKey: "leading-snug",
    trackingKey: "tracking-wide",
    fontFamilyKey: "label",
  },
  /**
   * StatBlock(md サイズ)等の大きな数値表示。tabular-nums 必須。
   * DS: weight-heavy / tracking-tight(design/components/DS-COMPONENT-SPECS.md の StatBlock 表)。
   */
  data: {
    sizeKey: "text-4xl",
    weightKey: "weight-heavy",
    leadingKey: "leading-tight",
    trackingKey: "tracking-tight",
    fontFamilyKey: "data",
    tabularNums: true,
  },
  /**
   * StatBlock(sm サイズ)等の小さめの数値表示。DS は `data` と同じ weight-heavy/tracking-tight で
   * サイズのみ text-2xl(以前は text-lg/weight-bold で DS と不一致だった。B 追加分)。
   */
  dataSm: {
    sizeKey: "text-2xl",
    weightKey: "weight-heavy",
    leadingKey: "leading-tight",
    trackingKey: "tracking-tight",
    fontFamilyKey: "data",
    tabularNums: true,
  },
  /**
   * StatBlock の単位表示(例: "km")用。DS: font-data / text-sm / weight-medium。
   * 数値本体(`data`/`dataSm`)と同じ `font-data` ファミリーを使うが太さ・tracking・tabular-nums は
   * 持たない(以前の実装は `bodySm`(font-body/weight-regular)を流用しており DS と不一致だった)。
   */
  dataUnit: {
    sizeKey: "text-sm",
    weightKey: "weight-medium",
    leadingKey: "leading-normal",
    fontFamilyKey: "data",
  },
  /**
   * Badge のラベル用。DS: font-label / text-xs / weight-bold / tracking-wide
   * (design/components/DS-COMPONENT-SPECS.md の Badge 表)。共通の `label` ロール(text-sm/
   * weight-medium。Tag 等が使う)とはサイズ・太さが異なるため専用ロールにした。
   */
  badgeLabel: {
    sizeKey: "text-xs",
    weightKey: "weight-bold",
    leadingKey: "leading-normal",
    trackingKey: "tracking-wide",
    fontFamilyKey: "label",
  },
};

function buildTypography(
  typography: GeneratedTypography,
): Record<TypographyRoleName, TextStyleToken> {
  const entries = (
    Object.entries(TYPOGRAPHY_ROLES) as [TypographyRoleName, TypographyRoleConfig][]
  ).map(([role, config]) => {
    const fontSize = parsePx(typography[config.sizeKey]);
    const style = toTextStyle(
      {
        fontSize,
        lineHeight: typography[config.leadingKey],
        letterSpacing: config.trackingKey ? typography[config.trackingKey] : undefined,
        fontWeight: typography[config.weightKey],
      },
      { tabularNums: config.tabularNums },
    );
    return [role, style] as const;
  });
  return Object.fromEntries(entries) as Record<TypographyRoleName, TextStyleToken>;
}

function buildTheme(tokens: WidenedGeneratedTokens) {
  return {
    colors: buildColors(tokens.colors),
    spacing: buildSpacing(tokens.spacing),
    radius: buildRadius(tokens.radius),
    sizing: buildSizing(tokens.sizing),
    shadow: buildShadow(tokens.shadow),
    typography: buildTypography(tokens.typography),
    /** ⚠️ 直書き禁止。テキストの fontFamily は必ずこの値経由で参照する */
    fontFamily: tokens.fontFamily,
    motion: buildMotion(tokens.easing, tokens.duration),
  } as const;
}

export const lightTheme = buildTheme(generatedLightTokens);
export const darkTheme = buildTheme(generatedDarkTokens);

export type AppTheme = typeof lightTheme;
