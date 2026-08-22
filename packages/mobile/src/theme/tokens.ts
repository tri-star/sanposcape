/**
 * デザイントークン。
 *
 * Claude Design の "Sanpo Design System" から取り込んだ値をそのまま保持する。
 * CSS カスタムプロパティ名との対応をコメントで残しているので、
 * デザイン側が更新されたらここを差し替えることで追従できる。
 *
 * このファイルは react-native を import しない（vitest の node 環境から
 * 素の値として参照できるようにするため）。
 */

// ---------------------------------------------------------------------------
// primitive: 生の値（意味を持たない）
// ---------------------------------------------------------------------------

/** tokens/colors.css の `--blue-*` 〜 `--white` に対応するカラーランプ。 */
export const palette = {
  blue900: "#0b3f86",
  blue700: "#0e6fd9",
  blue600: "#1585fe",
  blue500: "#3d97fe",
  blue300: "#90c6fd",
  blue200: "#c3e0ff",
  blue100: "#def2ff",
  blue050: "#eaf4ff",

  orange600: "#ef8a3c",
  orange500: "#f89e57",
  orange100: "#ffe8d3",

  green600: "#2fa85f",
  green500: "#35b36b",
  green100: "#d7f2e2",

  purple600: "#7a5fd6",
  purple500: "#8b6fe0",
  purple100: "#e7defb",

  red600: "#e0393f",
  red500: "#e6484d",
  red100: "#fde0e1",

  gpsGreen: "#37c873",

  ink900: "#1b2430",
  ink700: "#3a4453",
  ink500: "#6b7684",
  ink400: "#8a94a0",
  ink300: "#b7bfc9",
  ink200: "#e2e6eb",
  ink100: "#eef1f4",
  ink050: "#f5f7f9",
  white: "#ffffff",
} as const;

// ---------------------------------------------------------------------------
// 寸法・タイポグラフィ（テーマ非依存）
// ---------------------------------------------------------------------------

/** tokens/spacing.css の `--space-N`。キーが N（4px グリッド）に対応する。 */
export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

/** tokens/spacing.css の `--radius-*`。 */
export const radius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

/** tokens/spacing.css の `--control-*`。md がタッチターゲットの最小値。 */
export const control = {
  sm: 34,
  md: 44,
  lg: 54,
} as const;

/** tokens/spacing.css のレイアウト系。 */
export const layout = {
  pageGutter: 16,
  tabBarHeight: 64,
  hairline: 1,
} as const;

/**
 * tokens/typography.css。
 *
 * NOTE: fontFamily は未指定（端末の system font にフォールバックする）。
 * デザイン上は Noto Sans / Noto Sans JP 指定だが、フォントの同梱には
 * `@expo-google-fonts/*` の追加が必要なため別タスクとする。
 */
export const typography = {
  /** `--text-*`（px） */
  size: {
    "2xs": 11,
    xs: 12,
    sm: 13,
    md: 15,
    lg: 17,
    xl: 20,
    "2xl": 24,
    "3xl": 30,
    "4xl": 38,
    "5xl": 48,
  },
  /** `--weight-*`。RN の fontWeight は文字列で扱う。 */
  weight: {
    regular: "400",
    medium: "500",
    bold: "700",
    heavy: "800",
  },
  /** `--leading-*`。fontSize に対する倍率（RN の lineHeight は px なので `lineHeight()` で換算する）。 */
  leading: {
    tight: 1.15,
    snug: 1.3,
    normal: 1.55,
    relaxed: 1.75,
  },
  /** `--tracking-*`。em 単位（RN の letterSpacing は px なので `letterSpacing()` で換算する）。 */
  tracking: {
    tight: -0.01,
    normal: 0,
    wide: 0.04,
    caps: 0.08,
  },
} as const;

/** tokens/effects.css の `--dur-*`（ms）。 */
export const motion = {
  fast: 120,
  base: 200,
  slow: 320,
} as const;

/**
 * `--leading-*`（倍率）を RN の lineHeight（px）に換算する。
 *
 * @example lineHeight(15, 1.55) // 23.25
 */
export function lineHeight(fontSize: number, leading: number): number {
  return fontSize * leading;
}

/**
 * `--tracking-*`（em）を RN の letterSpacing（px）に換算する。
 *
 * @example letterSpacing(24, -0.01) // -0.24
 */
export function letterSpacing(fontSize: number, tracking: number): number {
  return fontSize * tracking;
}

// ---------------------------------------------------------------------------
// semantic（テーマ依存）
// ---------------------------------------------------------------------------

/** RN の shadow スタイル。CSS box-shadow の blur/2 を shadowRadius に対応させる。 */
export type ShadowStyle = {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
  elevation: number;
};

export type ThemeColors = {
  surfaceApp: string;
  surfaceCard: string;
  surfaceRaised: string;
  surfaceSunken: string;
  surfaceTint: string;
  surfaceTintStrong: string;
  surfaceInverse: string;

  textPrimary: string;
  textSecondary: string;
  textTertiary: string;
  textDisabled: string;
  /** surfaceInverse の上に載せる文字色（Toast など）。 */
  textOnInverse: string;
  textLink: string;

  borderSubtle: string;
  borderStrong: string;
  borderFocus: string;

  primary: string;
  primaryHover: string;
  primaryPress: string;
  primaryTint: string;
  /**
   * `primary` の面に載せるコンテンツ色。
   * ダークでは primary 自体が明るい青になるため、near-black になる点に注意
   * （`onColor` と取り違えないこと）。
   */
  onPrimary: string;
  /**
   * primary 以外の彩度の高い面（danger / success / 地図カテゴリ色）に載せるコンテンツ色。
   * これらの面はライト/ダークどちらでも十分に濃い色なので、両テーマとも白で固定する。
   */
  onColor: string;

  accent: string;
  accentHover: string;
  accentTint: string;

  success: string;
  successTint: string;
  warning: string;
  warningTint: string;
  danger: string;
  dangerTint: string;
  dangerPress: string;
  info: string;
  infoTint: string;

  /** secondary variant の押下背景。 */
  secondaryPress: string;
  /** outline / ghost variant の押下背景。 */
  neutralPress: string;
  /** disabled なコントロールの背景。 */
  disabledSurface: string;
  /** ProgressBar のトラック・BottomSheet のハンドルなど、薄いトラック色。 */
  trackSubtle: string;
  /** Switch の OFF トラックなど、やや強いトラック色。 */
  trackStrong: string;

  /** モーダルの背面スクリム。 */
  scrim: string;
};

/** 地図まわりの色（カテゴリピン・地図キャンバス）。 */
export type ThemeMapColors = {
  park: string;
  cafe: string;
  culture: string;
  station: string;
  route: string;
  /** 復路（往路と異なる帰り道）の線色。往路と同系色で明度を変え、破線と併用して区別する。 */
  routeReturn: string;
  canvas: string;
  water: string;
  greenspace: string;
  road: string;
};

export type ThemeShadows = {
  xs: ShadowStyle;
  sm: ShadowStyle;
  md: ShadowStyle;
  lg: ShadowStyle;
  sheet: ShadowStyle;
  pin: ShadowStyle;
};

export type Theme = {
  name: "light" | "dark";
  colors: ThemeColors;
  map: ThemeMapColors;
  shadows: ThemeShadows;
  palette: typeof palette;
  spacing: typeof spacing;
  radius: typeof radius;
  control: typeof control;
  layout: typeof layout;
  typography: typeof typography;
  motion: typeof motion;
};

const lightColors: ThemeColors = {
  surfaceApp: palette.ink050,
  surfaceCard: palette.white,
  surfaceRaised: palette.white,
  surfaceSunken: palette.ink050,
  surfaceTint: palette.blue050,
  surfaceTintStrong: palette.blue100,
  surfaceInverse: palette.ink900,

  textPrimary: palette.ink900,
  textSecondary: palette.ink500,
  textTertiary: palette.ink400,
  textDisabled: palette.ink300,
  textOnInverse: palette.white,
  textLink: palette.blue600,

  borderSubtle: palette.ink200,
  borderStrong: palette.ink300,
  borderFocus: palette.blue600,

  primary: palette.blue600,
  primaryHover: palette.blue700,
  primaryPress: palette.blue900,
  primaryTint: palette.blue100,
  onPrimary: palette.white,
  onColor: palette.white,

  accent: palette.orange500,
  accentHover: palette.orange600,
  accentTint: palette.orange100,

  success: palette.green500,
  successTint: palette.green100,
  warning: palette.orange500,
  warningTint: palette.orange100,
  danger: palette.red500,
  dangerTint: palette.red100,
  dangerPress: palette.red600,
  info: palette.blue600,
  infoTint: palette.blue100,

  secondaryPress: palette.blue300,
  neutralPress: palette.ink100,
  disabledSurface: palette.ink200,
  trackSubtle: palette.ink100,
  trackStrong: palette.ink200,

  scrim: "rgba(27, 36, 48, 0.45)",
};

const darkColors: ThemeColors = {
  surfaceApp: "#0f1621",
  surfaceCard: "#182231",
  surfaceRaised: "#1f2b3c",
  surfaceSunken: "#0b111a",
  surfaceTint: "#14304f",
  surfaceTintStrong: "#1a3f66",
  surfaceInverse: "#eef1f4",

  textPrimary: "#eaf1f8",
  textSecondary: "#9fb0c2",
  textTertiary: "#7d8da0",
  textDisabled: "#4d5a6b",
  textOnInverse: "#0f1621",
  textLink: "#6fb2ff",

  borderSubtle: "#2a3648",
  borderStrong: "#3a4a60",
  borderFocus: "#3d97fe",

  primary: "#3d97fe",
  primaryHover: "#5aa8ff",
  primaryPress: "#90c6fd",
  primaryTint: "#14304f",
  onPrimary: "#06121f",
  onColor: "#ffffff",

  accent: "#f89e57",
  accentHover: "#ffb173",
  accentTint: "#3a2a18",

  success: "#43c47c",
  successTint: "#12321f",
  warning: "#f89e57",
  warningTint: "#3a2a18",
  danger: "#f2686d",
  dangerTint: "#3a1a1c",
  dangerPress: "#d9565b",
  info: "#3d97fe",
  infoTint: "#14304f",

  secondaryPress: "#235688",
  neutralPress: "#1f2b3c",
  disabledSurface: "#2a3648",
  trackSubtle: "#2a3648",
  trackStrong: "#3a4a60",

  scrim: "rgba(6, 12, 20, 0.6)",
};

const lightMap: ThemeMapColors = {
  park: palette.green500,
  cafe: palette.orange500,
  culture: palette.purple500,
  station: palette.red500,
  route: palette.blue600,
  // SS-33 暫定: Sanpo Design System に復路色の定義が無いため palette から流用。デザイン確定時に差し替える。
  routeReturn: palette.blue900,
  canvas: "#f5f6f7",
  water: "#cae7fd",
  greenspace: "#e6f2e4",
  road: "#ffffff",
};

const darkMap: ThemeMapColors = {
  park: "#43c47c",
  cafe: "#f89e57",
  culture: "#a98cf0",
  station: "#f2686d",
  route: "#3d97fe",
  // SS-33 暫定: Sanpo Design System に復路色の定義が無いため palette から流用。デザイン確定時に差し替える。
  routeReturn: palette.blue300,
  canvas: "#131c28",
  water: "#16344f",
  greenspace: "#172a20",
  road: "#223044",
};

/** CSS の `0 {offsetY}px {blur}px rgba(...)` を RN の shadow プロパティに変換する。 */
function shadow(
  color: string,
  offsetY: number,
  blur: number,
  opacity: number,
  elevation: number,
): ShadowStyle {
  return {
    shadowColor: color,
    shadowOffset: { width: 0, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: blur / 2,
    elevation,
  };
}

const SHADOW_INK = "#1b2430";
const SHADOW_BLACK = "#000000";

const lightShadows: ThemeShadows = {
  xs: shadow(SHADOW_INK, 1, 2, 0.06, 1),
  sm: shadow(SHADOW_INK, 2, 8, 0.07, 2),
  md: shadow(SHADOW_INK, 6, 18, 0.1, 5),
  lg: shadow(SHADOW_INK, 12, 34, 0.14, 10),
  sheet: shadow(SHADOW_INK, -8, 30, 0.12, 12),
  pin: shadow(SHADOW_INK, 4, 10, 0.22, 4),
};

const darkShadows: ThemeShadows = {
  xs: shadow(SHADOW_BLACK, 1, 2, 0.4, 1),
  sm: shadow(SHADOW_BLACK, 2, 8, 0.45, 2),
  md: shadow(SHADOW_BLACK, 6, 18, 0.5, 5),
  lg: shadow(SHADOW_BLACK, 12, 34, 0.55, 10),
  sheet: shadow(SHADOW_BLACK, -8, 30, 0.5, 12),
  pin: shadow(SHADOW_BLACK, 4, 12, 0.6, 4),
};

const shared = {
  palette,
  spacing,
  radius,
  control,
  layout,
  typography,
  motion,
} as const;

export const lightTheme: Theme = {
  name: "light",
  colors: lightColors,
  map: lightMap,
  shadows: lightShadows,
  ...shared,
};

export const darkTheme: Theme = {
  name: "dark",
  colors: darkColors,
  map: darkMap,
  shadows: darkShadows,
  ...shared,
};

export const themes = {
  light: lightTheme,
  dark: darkTheme,
} as const;

/** テーマの選択方法。`system` は端末の外観設定に追従する。 */
export type ThemeMode = "system" | "light" | "dark";

/**
 * 端末の外観設定。RN の `useColorScheme()` の戻り値に合わせている
 * （react-native に依存しないよう、ここで同じ形を定義する）。
 */
export type SystemColorScheme = "light" | "dark" | "unspecified" | null | undefined;

/**
 * モードと端末の外観設定から実際に適用するテーマを決める。
 * UI から切り離した純粋関数にして vitest でテストできるようにしている。
 */
export function resolveTheme(mode: ThemeMode, systemScheme: SystemColorScheme): Theme {
  if (mode === "light" || mode === "dark") return themes[mode];
  return systemScheme === "dark" ? darkTheme : lightTheme;
}
