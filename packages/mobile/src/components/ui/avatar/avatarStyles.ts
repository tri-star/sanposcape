import type { AppTheme } from "@/theme/tokens";

export type AvatarSize = "sm" | "md" | "lg";

export type AvatarAppearance = {
  boxSize: number;
  borderRadius: number;
  backgroundColor: string;
  initialColor: string;
  initialFontSize: number;
  /** name が無い場合のフォールバック(`user` アイコン)のサイズ。DS: サイズ × 0.5 */
  fallbackIconSize: number;
};

/**
 * Avatar の直径。DS 実物(design/components/DS-COMPONENT-SPECS.md)は sm 32 / md 44 / lg 64 の
 * 3サイズで、以前の実装(28/36/48 + 独自の `xl` 64)とは一致していなかった。
 * `xl` は DS に対応が無いため削除し、DS の3サイズに揃える(Avatar の DS 差異。B 追加分)。
 */
const BOX_SIZE: Record<AvatarSize, number> = {
  sm: 32,
  md: 44,
  lg: 64,
};

/** DS: 文字サイズはサイズ × 0.4、フォールバックアイコンはサイズ × 0.5 */
const INITIAL_FONT_SIZE_FACTOR = 0.4;
const FALLBACK_ICON_SIZE_FACTOR = 0.5;

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
  const boxSize = BOX_SIZE[size];
  return {
    boxSize,
    // 常に円形(borderRadius が boxSize/2 以上あれば十分)
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.primaryTint,
    initialColor: theme.colors.primary,
    initialFontSize: boxSize * INITIAL_FONT_SIZE_FACTOR,
    fallbackIconSize: boxSize * FALLBACK_ICON_SIZE_FACTOR,
  };
}
