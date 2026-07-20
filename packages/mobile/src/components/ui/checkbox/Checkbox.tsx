import { Pressable, Text, View } from "react-native";
import { useUnistyles, StyleSheet } from "react-native-unistyles";

import { Icon } from "@/components/ui/icon/Icon";
import { resolveCheckboxAppearance } from "@/components/ui/checkbox/checkboxStyles";

export type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  /** 一部選択状態 */
  indeterminate?: boolean;
  testID?: string;
};

/** グループ管理(複数 Checkbox のまとめ)はここでは扱わない。呼び出し側(feature)の責務 */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
  indeterminate = false,
  testID,
}: CheckboxProps) {
  // `useUnistyles()` は hitSlop の計算にのみ使う。見た目は StyleSheet.create 側で解決する。
  const { theme } = useUnistyles();
  const args = { checked, indeterminate, disabled };
  const appearance = resolveCheckboxAppearance(theme, args);

  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: indeterminate ? "mixed" : checked, disabled }}
      disabled={disabled}
      onPress={() => onChange(!checked)}
      testID={testID}
      hitSlop={
        appearance.hitSlop > 0
          ? {
              top: appearance.hitSlop,
              bottom: appearance.hitSlop,
              left: appearance.hitSlop,
              right: appearance.hitSlop,
            }
          : undefined
      }
      style={styles.row(args)}
    >
      <View style={styles.box(args)}>
        {appearance.iconName ? (
          <Icon name={appearance.iconName} size={16} color={appearance.iconColor} />
        ) : null}
      </View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: (args: { checked: boolean; indeterminate: boolean; disabled: boolean }) => {
    const appearance = resolveCheckboxAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[8],
      opacity: appearance.opacity,
    };
  },
  box: (args: { checked: boolean; indeterminate: boolean; disabled: boolean }) => {
    const appearance = resolveCheckboxAppearance(theme, args);
    return {
      width: appearance.boxSize,
      height: appearance.boxSize,
      borderRadius: appearance.borderRadius,
      borderWidth: appearance.borderWidth,
      borderColor: appearance.borderColor,
      backgroundColor: appearance.backgroundColor,
      alignItems: "center",
      justifyContent: "center",
    };
  },
  label: {
    color: theme.colors.text,
    fontFamily: theme.fontFamily.body,
    ...theme.typography.body,
  },
}));
