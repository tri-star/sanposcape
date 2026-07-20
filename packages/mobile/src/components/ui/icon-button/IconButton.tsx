import { Pressable } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import {
  resolveIconButtonAppearance,
  type IconButtonSize,
  type IconButtonVariant,
} from "@/components/ui/icon-button/iconButtonStyles";

export type IconButtonProps = {
  iconName: IconName;
  /** 必須。スクリーンリーダー用 */
  accessibilityLabel: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  disabled?: boolean;
  onPress: () => void;
  testID?: string;
};

export function IconButton({
  iconName,
  accessibilityLabel,
  variant = "primary",
  size = "md",
  disabled = false,
  onPress,
  testID,
}: IconButtonProps) {
  // `useUnistyles()` は hitSlop(非スタイル値)の計算にのみ使う。見た目は StyleSheet.create 側で解決する。
  const { theme } = useUnistyles();
  const { hitSlop } = resolveIconButtonAppearance(theme, {
    variant,
    size,
    disabled,
    pressed: false,
  });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      hitSlop={
        hitSlop > 0 ? { top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop } : undefined
      }
      style={({ pressed }) => styles.root({ variant, size, disabled, pressed })}
    >
      {({ pressed }) => {
        const appearance = resolveIconButtonAppearance(theme, { variant, size, disabled, pressed });
        return <Icon name={iconName} size={appearance.iconSize} color={appearance.iconColor} />;
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: (args: {
    variant: IconButtonVariant;
    size: IconButtonSize;
    disabled: boolean;
    pressed: boolean;
  }) => {
    const appearance = resolveIconButtonAppearance(theme, args);
    return {
      width: appearance.boxSize,
      height: appearance.boxSize,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: appearance.backgroundColor,
      borderColor: appearance.borderColor,
      borderWidth: appearance.borderWidth,
      borderRadius: theme.radius.pill,
      opacity: appearance.opacity,
      transform: [{ scale: appearance.scale }],
    };
  },
}));
