import { ActivityIndicator, Pressable, Text } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

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
  // `useUnistyles()` はここでは hitSlop(タップ領域を44pxまで補う非スタイル値)の計算にのみ使う。
  // 見た目のスタイル自体は下の `StyleSheet.create` 側で解決するため、テーマ切替時の再レンダーは
  // この数値計算だけに限定される(スタイルツリー全体は再レンダーされない)。
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
      style={({ pressed }) =>
        styles.root({ variant, size, disabled: isDisabled, pressed, fullWidth })
      }
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
            <Text style={styles.label({ variant, size, disabled: isDisabled, pressed })}>
              {label}
            </Text>
          </>
        );
      }}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  root: (args: {
    variant: ButtonVariant;
    size: ButtonSize;
    disabled: boolean;
    pressed: boolean;
    fullWidth: boolean;
  }) => {
    const appearance = resolveButtonAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: theme.spacing[8],
      alignSelf: args.fullWidth ? "stretch" : "flex-start",
      backgroundColor: appearance.backgroundColor,
      borderColor: appearance.borderColor,
      borderWidth: appearance.borderWidth,
      borderRadius: appearance.borderRadius,
      paddingHorizontal: appearance.paddingHorizontal,
      minHeight: appearance.minHeight,
      opacity: appearance.opacity,
      transform: [{ scale: appearance.scale }],
    };
  },
  label: (args: {
    variant: ButtonVariant;
    size: ButtonSize;
    disabled: boolean;
    pressed: boolean;
  }) => {
    const appearance = resolveButtonAppearance(theme, args);
    return {
      color: appearance.textColor,
      fontFamily: theme.fontFamily.label,
      ...theme.typography.label,
    };
  },
}));
