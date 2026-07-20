import type { AppTheme } from "@/theme/tokens";

export type AvatarSize = "sm" | "md" | "lg" | "xl";

export type AvatarAppearance = {
  boxSize: number;
  borderRadius: number;
  backgroundColor: string;
  initialColor: string;
  initialFontSize: number;
};

/**
 * Avatar の直径。DS のトークン(色/寸法/角丸/影/タイポグラフィ)には
 * アバターサイズ専用のスケールが無いため、`--control-*` に近い実用的な値として
 * このコンポーネント内で定義する(SS-1 実装時点で DesignSync 未接続のため確定値ではない。
 * 実データが確認できた時点で見直すこと)。
 */
const BOX_SIZE: Record<AvatarSize, number> = {
  sm: 28,
  md: 36,
  lg: 48,
  xl: 64,
};

const INITIAL_FONT_SIZE: Record<AvatarSize, number> = {
  sm: 12,
  md: 14,
  lg: 18,
  xl: 24,
};

/** name の先頭1文字を大文字で返す。サロゲートペア(絵文字等)を壊さないよう Array.from を使う */
export function getAvatarInitial(name?: string): string | null {
  if (name === undefined) {
    return null;
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const [first] = Array.from(trimmed);
  return first ? first.toUpperCase() : null;
}

export function resolveAvatarAppearance(
  theme: AppTheme,
  args: { size: AvatarSize },
): AvatarAppearance {
  const { size } = args;
  return {
    boxSize: BOX_SIZE[size],
    // 常に円形(borderRadius が boxSize/2 以上あれば十分)
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryTint,
    initialColor: theme.colors.primary,
    initialFontSize: INITIAL_FONT_SIZE[size],
  };
}
