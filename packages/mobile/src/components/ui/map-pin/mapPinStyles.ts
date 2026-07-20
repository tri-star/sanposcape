import type { IconName } from "@/components/ui/icon/iconRegistry";
import type { AppTheme } from "@/theme/tokens";

export type MapPinCategory = "park" | "cafe" | "culture" | "station";
export type MapPinVariant = "category" | "current" | "destination";

export type MapPinAppearance = {
  fillColor: string;
  iconColor: string;
  iconName: IconName;
  size: number;
};

const CATEGORY_ICON: Record<MapPinCategory, IconName> = {
  park: "trees",
  cafe: "coffee",
  culture: "library",
  station: "train",
};

const BASE_SIZE = 32;
const SELECTED_SCALE = 1.25;

/**
 * category/variant/selected から MapPin の見た目を解決する純粋関数。
 * `current`(現在地)/`destination`(目的地)はカテゴリを持たない特殊ピンのため、
 * `theme.colors.category` ではなく `info`/`danger` を使う。
 */
export function resolveMapPinAppearance(
  theme: AppTheme,
  args: { category: MapPinCategory; selected: boolean; variant: MapPinVariant },
): MapPinAppearance {
  const { category, selected, variant } = args;

  const fillColor =
    variant === "current"
      ? theme.colors.info
      : variant === "destination"
        ? theme.colors.danger
        : theme.colors.category[category];

  const iconName: IconName =
    variant === "current"
      ? "navigation"
      : variant === "destination"
        ? "flag"
        : CATEGORY_ICON[category];

  return {
    fillColor,
    iconColor: theme.colors.onPrimary,
    iconName,
    size: selected ? Math.round(BASE_SIZE * SELECTED_SCALE) : BASE_SIZE,
  };
}
