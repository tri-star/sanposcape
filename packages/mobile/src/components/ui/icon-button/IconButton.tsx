import { Pressable, type StyleProp, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { hitSlopFor } from "@/lib/hitSlop";
import type { Theme } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type IconButtonVariant = "filled" | "tinted" | "surface" | "ghost";
export type IconButtonSize = "sm" | "md" | "lg";

export type IconButtonProps = {
  icon: IconName;
  /** スクリーンリーダー用のラベル（必須）。 */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** 選択中（トグル）状態。true のとき primary で塗る。 */
  active?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const BOX_SIZE: Record<IconButtonSize, number> = { sm: 32, md: 44, lg: 54 };
const ICON_SIZE: Record<IconButtonSize, number> = { sm: 16, md: 20, lg: 22 };

/**
 * 状態の優先順位は disabled → active → pressed → variant。
 * disabled を最優先にしないと「押せないのに有効に見える」状態が生まれ、
 * active より pressed を後に見ないとトグル選択中の押下フィードバックが消える。
 */
function resolveColors(
  theme: Theme,
  variant: IconButtonVariant,
  state: { active: boolean; disabled: boolean; pressed: boolean },
): { background: string; foreground: string } {
  const { colors } = theme;

  // Button と同じく、無効時は面を落として「押せない」ことを色でも示す。
  if (state.disabled) {
    return {
      background: variant === "ghost" ? "transparent" : colors.disabledSurface,
      foreground: colors.textDisabled,
    };
  }

  if (state.active) {
    return {
      background: state.pressed ? colors.primaryPress : colors.primary,
      foreground: colors.onPrimary,
    };
  }

  const base: Record<IconButtonVariant, { background: string; foreground: string }> = {
    filled: { background: colors.primary, foreground: colors.onPrimary },
    tinted: { background: colors.primaryTint, foreground: colors.primary },
    surface: { background: colors.surfaceCard, foreground: colors.textPrimary },
    ghost: { background: "transparent", foreground: colors.textSecondary },
  };

  const resolved = base[variant];
  if (state.pressed) {
    return {
      background: variant === "filled" ? colors.primaryPress : colors.neutralPress,
      foreground: resolved.foreground,
    };
  }
  return resolved;
}

/**
 * IconButton — 円形のアイコンのみのコントロール。
 * 地図上のツール（現在地など）やツールバーのアクションに使う。
 * デザイン: Sanpo Design System / components/core/IconButton
 */
export function IconButton({
  icon,
  label,
  variant = "surface",
  size = "md",
  active = false,
  disabled = false,
  onPress,
  style,
  testID,
}: IconButtonProps) {
  const theme = useTheme();
  const box = BOX_SIZE[size];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={hitSlopFor(box)}
      style={({ pressed }) => {
        const c = resolveColors(theme, variant, { active, disabled, pressed });
        return [
          {
            width: box,
            height: box,
            borderRadius: theme.radius.pill,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: c.background,
            transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
          },
          variant === "surface" && !disabled ? theme.shadows.sm : null,
          style,
        ];
      }}
    >
      {({ pressed }) => (
        <Icon
          name={icon}
          size={ICON_SIZE[size]}
          color={resolveColors(theme, variant, { active, disabled, pressed }).foreground}
        />
      )}
    </Pressable>
  );
}
