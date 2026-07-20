import { ActivityIndicator, Pressable, Text } from "react-native";
import { useUnistyles } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import {
  resolveButtonAppearance,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/ui/button/buttonStyles";

export type ButtonProps = {
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  /** 左に置くアイコン */
  iconName?: IconName;
  fullWidth?: boolean;
  onPress: () => void;
  testID?: string;
};

export function Button({
  label,
  variant = "primary",
  size = "md",
  disabled = false,
  loading = false,
  iconName,
  fullWidth = false,
  onPress,
  testID,
}: ButtonProps) {
  const { theme } = useUnistyles();
  const isDisabled = disabled || loading;

  // hitSlop はサイズのみに依存する(press 状態に依存しない)ため、レンダー1回だけ解決する
  const { hitSlop } = resolveButtonAppearance(theme, {
    variant,
    size,
    disabled: isDisabled,
    pressed: false,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      testID={testID}
      hitSlop={
        hitSlop > 0 ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop } : undefined
      }
      style={({ pressed }) => {
        const appearance = resolveButtonAppearance(theme, {
          variant,
          size,
          disabled: isDisabled,
          pressed,
        });
        return {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing[8],
          alignSelf: fullWidth ? "stretch" : "flex-start",
          backgroundColor: appearance.backgroundColor,
          borderColor: appearance.borderColor,
          borderWidth: appearance.borderWidth,
          borderRadius: appearance.borderRadius,
          paddingHorizontal: appearance.paddingHorizontal,
          minHeight: appearance.minHeight,
          opacity: appearance.opacity,
          transform: [{ scale: appearance.scale }],
        };
      }}
    >
      {({ pressed }) => {
        const appearance = resolveButtonAppearance(theme, {
          variant,
          size,
          disabled: isDisabled,
          pressed,
        });
        if (loading) {
          return <ActivityIndicator color={appearance.textColor} />;
        }
        return (
          <>
            {iconName ? <Icon name={iconName} color={appearance.textColor} size={18} /> : null}
            <Text
              style={{
                color: appearance.textColor,
                fontFamily: theme.fontFamily.label,
                ...theme.typography.label,
              }}
            >
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}
