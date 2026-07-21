import { ICONS, type IconName } from "@/components/ui/icon/iconRegistry";
import { useTheme } from "@/theme/useTheme";

export type { IconName };

export type IconProps = {
  name: IconName;
  /** 一辺の px。デザイン既定は 20。 */
  size?: number;
  /** 省略時は本文色（`text-primary`）。 */
  color?: string;
  strokeWidth?: number;
};

/**
 * Lucide アイコンのラッパ。
 * デザインの kebab-case 名をそのまま `name` に渡せるようにしている。
 */
export function Icon({ name, size = 20, color, strokeWidth = 2 }: IconProps) {
  const theme = useTheme();
  const LucideIcon = ICONS[name];

  return (
    <LucideIcon size={size} color={color ?? theme.colors.textPrimary} strokeWidth={strokeWidth} />
  );
}
