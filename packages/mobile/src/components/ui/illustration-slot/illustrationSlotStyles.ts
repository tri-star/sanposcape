import type { IconName } from "@/components/ui/icon/iconRegistry";
import type { AppTheme } from "@/theme/tokens";

export type IllustrationSlotKind = "home-hero" | "empty-walks" | "empty-spots" | "nav-idle";
export type IllustrationSlotSize = "sm" | "md" | "lg";

export type IllustrationSlotAppearance = {
  iconName: IconName;
  tintColor: string;
  iconColor: string;
  boxSize: number;
  iconSize: number;
  borderRadius: number;
};

type TintKind = "primary" | "accent" | "neutral";

const KIND_CONFIG: Record<IllustrationSlotKind, { iconName: IconName; tint: TintKind }> = {
  "home-hero": { iconName: "home", tint: "primary" },
  "empty-walks": { iconName: "footprints", tint: "neutral" },
  "empty-spots": { iconName: "map-pin", tint: "neutral" },
  "nav-idle": { iconName: "compass", tint: "accent" },
};

/** 未知の kind が渡された場合のフォールバック先 */
const FALLBACK_KIND: IllustrationSlotKind = "empty-walks";

const SIZE_CONFIG: Record<IllustrationSlotSize, { boxSize: number; iconSize: number }> = {
  sm: { boxSize: 96, iconSize: 32 },
  md: { boxSize: 160, iconSize: 48 },
  lg: { boxSize: 220, iconSize: 64 },
};

function resolveTintPalette(
  theme: AppTheme,
  tint: TintKind,
): { tintColor: string; iconColor: string } {
  switch (tint) {
    case "primary":
      return { tintColor: theme.colors.primaryTint, iconColor: theme.colors.primary };
    case "accent":
      return { tintColor: theme.colors.accentTint, iconColor: theme.colors.accent };
    case "neutral":
      return { tintColor: theme.colors.surfaceSunken, iconColor: theme.colors.textTertiary };
  }
}

/**
 * kind/size から IllustrationSlot の見た目を解決する純粋関数。
 * 実イラストアセットが未提供のため、light/dark 共通で「tint パネル + Lucide アイコン」を返す。
 */
export function resolveIllustrationSlotAppearance(
  theme: AppTheme,
  args: { kind: IllustrationSlotKind; size: IllustrationSlotSize },
): IllustrationSlotAppearance {
  const { kind, size } = args;
  const kindConfig = KIND_CONFIG[kind] ?? KIND_CONFIG[FALLBACK_KIND];
  const sizeConfig = SIZE_CONFIG[size];
  const palette = resolveTintPalette(theme, kindConfig.tint);

  return {
    iconName: kindConfig.iconName,
    tintColor: palette.tintColor,
    iconColor: palette.iconColor,
    boxSize: sizeConfig.boxSize,
    iconSize: sizeConfig.iconSize,
    borderRadius: theme.radius.xl,
  };
}
