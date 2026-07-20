import { Pressable, Text, View } from "react-native";
import { useUnistyles } from "react-native-unistyles";

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
  const { theme } = useUnistyles();
  const appearance = resolveCheckboxAppearance(theme, { checked, indeterminate, disabled });

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
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing[8],
        opacity: appearance.opacity,
      }}
    >
      <View
        style={{
          width: appearance.boxSize,
          height: appearance.boxSize,
          borderRadius: appearance.borderRadius,
          borderWidth: appearance.borderWidth,
          borderColor: appearance.borderColor,
          backgroundColor: appearance.backgroundColor,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {appearance.iconName ? (
          <Icon name={appearance.iconName} size={16} color={appearance.iconColor} />
        ) : null}
      </View>
      {label ? (
        <Text
          style={{
            color: theme.colors.text,
            fontFamily: theme.fontFamily.body,
            ...theme.typography.body,
          }}
        >
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}
