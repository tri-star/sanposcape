import type { IconName } from "@/components/ui/icon/iconRegistry";
import type { AppTheme } from "@/theme/tokens";

export type MapPinCategory = "park" | "cafe" | "culture" | "station";
export type MapPinVariant = "category" | "current" | "destination";

export type MapPinAppearance = {
  fillColor: string;
  /** DS: 縁取り 2.5px `surface-card`(design/components/DS-COMPONENT-SPECS.md) */
  strokeColor: string;
  strokeWidth: number;
  /** DS: アイコンは常に #fff(テーマ非依存) */
  iconColor: string;
  iconName: IconName;
  size: number;
  /** DS: サイズ × 0.42(以前は 0.4 で僅かにずれていた) */
  iconSize: number;
  /** DS: アイコンの strokeWidth は 2.4(雫の回転を打ち消して正立させる) */
  iconStrokeWidth: number;
  boxShadow: string;
};

/** design/components/DS-COMPONENT-SPECS.md の MapPin 表と一致(B-6) */
const CATEGORY_ICON: Record<MapPinCategory, IconName> = {
  park: "tree-pine",
  cafe: "coffee",
  culture: "book-open",
  station: "train-front",
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

  const size = selected ? Math.round(BASE_SIZE * SELECTED_SCALE) : BASE_SIZE;

  return {
    fillColor,
    strokeColor: theme.colors.surface,
    strokeWidth: 2.5,
    iconColor: "#fff",
    iconName,
    size,
    iconSize: size * 0.42,
    iconStrokeWidth: 2.4,
    boxShadow: theme.shadow.pin,
  };
}
