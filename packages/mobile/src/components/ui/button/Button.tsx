import type { ReactNode } from "react";
import { Pressable, type StyleProp, Text, type ViewStyle } from "react-native";

import { Icon, type IconName } from "@/components/ui/icon/Icon";
import { hitSlopFor } from "@/lib/hitSlop";
import { makeStyles } from "@/theme/makeStyles";
import type { Theme } from "@/theme/tokens";
import { useTheme } from "@/theme/useTheme";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export type ButtonProps = {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: "left" | "right";
  fullWidth?: boolean;
  disabled?: boolean;
  /** `pill`（既定）は完全な角丸、`rounded` は `--radius-md`。 */
  shape?: "pill" | "rounded";
  /**
   * 必須。省略できると「操作できるように見えて何も起きない」ボタンを作れてしまうため
   * （押下フィードバックは出るのに何も起きず、スクリーンリーダーにも有効なボタンとして露出する）。
   * 一時的に無効化したい場合は `disabled` を使う。
   */
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  /** E2E / テスト用のラベル。 */
  testID?: string;
};

const HEIGHT: Record<ButtonSize, keyof Theme["control"]> = { sm: "sm", md: "md", lg: "lg" };
const PADDING_X: Record<ButtonSize, number> = { sm: 16, md: 22, lg: 28 };
const ICON_SIZE: Record<ButtonSize, number> = { sm: 16, md: 18, lg: 20 };
const FONT_SIZE: Record<ButtonSize, keyof Theme["typography"]["size"]> = {
  sm: "sm",
  md: "md",
  lg: "lg",
};

type VariantColors = {
  background: string;
  foreground: string;
  borderColor: string;
  borderWidth: number;
};

function resolveColors(
  theme: Theme,
  variant: ButtonVariant,
  state: { disabled: boolean; pressed: boolean },
): VariantColors {
  const { colors } = theme;

  if (state.disabled) {
    return {
      background:
        variant === "outline" || variant === "ghost" ? "transparent" : colors.disabledSurface,
      foreground: colors.textDisabled,
      borderColor: variant === "outline" ? colors.borderSubtle : "transparent",
      borderWidth: variant === "outline" ? 1.5 : 0,
    };
  }

  switch (variant) {
    case "secondary":
      return {
        background: state.pressed ? colors.secondaryPress : colors.primaryTint,
        foreground: colors.primary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "outline":
      return {
        background: state.pressed ? colors.neutralPress : "transparent",
        foreground: colors.textPrimary,
        borderColor: colors.borderStrong,
        borderWidth: 1.5,
      };
    case "ghost":
      return {
        background: state.pressed ? colors.primaryTint : "transparent",
        foreground: colors.primary,
        borderColor: "transparent",
        borderWidth: 0,
      };
    case "danger":
      return {
        background: state.pressed ? colors.dangerPress : colors.danger,
        foreground: colors.onColor,
        borderColor: "transparent",
        borderWidth: 0,
      };
    default:
      return {
        background: state.pressed ? colors.primaryPress : colors.primary,
        foreground: colors.onPrimary,
        borderColor: "transparent",
        borderWidth: 0,
      };
  }
}

/**
 * Button — アプリの主要なアクション。既定はピル型。
 * デザイン: Sanpo Design System / components/core/Button
 */
export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconPosition = "left",
  fullWidth = false,
  disabled = false,
  shape = "pill",
  onPress,
  style,
  testID,
}: ButtonProps) {
  const theme = useTheme();
  const styles = useStyles();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={hitSlopFor(theme.control[HEIGHT[size]])}
      style={({ pressed }) => {
        const c = resolveColors(theme, variant, { disabled, pressed });
        return [
          styles.base,
          {
            height: theme.control[HEIGHT[size]],
            paddingHorizontal: PADDING_X[size],
            borderRadius: shape === "pill" ? theme.radius.pill : theme.radius.md,
            flexDirection: iconPosition === "right" ? "row-reverse" : "row",
            alignSelf: fullWidth ? "stretch" : "flex-start",
            backgroundColor: c.background,
            borderColor: c.borderColor,
            borderWidth: c.borderWidth,
            transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
          },
          variant === "primary" && !disabled ? theme.shadows.sm : null,
          style,
        ];
      }}
    >
      {({ pressed }) => {
        const c = resolveColors(theme, variant, { disabled, pressed });
        return (
          <>
            {icon ? <Icon name={icon} size={ICON_SIZE[size]} color={c.foreground} /> : null}
            <Text
              style={[
                styles.label,
                { fontSize: theme.typography.size[FONT_SIZE[size]], color: c.foreground },
              ]}
            >
              {children}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    alignItems: "center",
    justifyContent: "center",
    gap: theme.spacing[2],
  },
  label: {
    fontWeight: theme.typography.weight.bold,
    textAlign: "center",
  },
}));
