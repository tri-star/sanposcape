import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { BottomSheet } from "@/components/ui/bottom-sheet/BottomSheet";
import { Icon } from "@/components/ui/icon/Icon";
import type { IconName } from "@/components/ui/icon/iconRegistry";
import {
  resolveSelectAppearance,
  resolveSelectDisplayLabel,
} from "@/components/ui/select/selectStyles";

export type SelectOption<T extends string> = {
  value: T;
  label: string;
  iconName?: IconName;
  disabled?: boolean;
};

export type SelectProps<T extends string> = {
  value: T | null;
  options: SelectOption<T>[];
  onChange: (value: T) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  testID?: string;
};

const DEFAULT_PLACEHOLDER = "選択してください";

/** Web の dropdown は不採用。BottomSheet の上に選択リストを載せる(モバイル向けの作り替え) */
export function Select<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder = DEFAULT_PLACEHOLDER,
  disabled = false,
  testID,
}: SelectProps<T>) {
  const [open, setOpen] = useState(false);
  const displayLabel = resolveSelectDisplayLabel(value, options, placeholder);

  return (
    <View testID={testID}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label ?? displayLabel}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => setOpen(true)}
        testID={testID ? `${testID}-trigger` : undefined}
        style={({ pressed }) => styles.trigger({ disabled, pressed })}
      >
        <Text numberOfLines={1} style={styles.triggerText({ disabled, hasValue: value !== null })}>
          {displayLabel}
        </Text>
        <Icon name="chevron-down" size={16} color={styles.triggerIcon({ disabled }).color} />
      </Pressable>

      <BottomSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={label ?? placeholder}
        testID={testID ? `${testID}-sheet` : undefined}
      >
        {options.map((option) => {
          const selected = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected, disabled: option.disabled }}
              disabled={option.disabled}
              onPress={() => {
                onChange(option.value);
                setOpen(false);
              }}
              testID={testID ? `${testID}-option-${option.value}` : undefined}
              style={styles.option({ disabled: option.disabled ?? false })}
            >
              {option.iconName ? (
                <Icon name={option.iconName} size={18} color={styles.optionText.color} />
              ) : null}
              <Text style={styles.optionText}>{option.label}</Text>
              {selected ? <Icon name="check" size={18} color={styles.selectedIcon.color} /> : null}
            </Pressable>
          );
        })}
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  label: {
    color: theme.colors.textMuted,
    marginBottom: theme.spacing[4],
    fontFamily: theme.fontFamily.label,
    ...theme.typography.label,
  },
  // DS: Input と同じ左パディング14、右はシェブロン用に40確保(design/components/DS-COMPONENT-SPECS.md)
  trigger: (args: { disabled: boolean; pressed: boolean }) => {
    const appearance = resolveSelectAppearance(theme, args);
    return {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: theme.spacing[8],
      minHeight: theme.sizing.controlMd,
      paddingLeft: 14,
      paddingRight: 40,
      borderRadius: theme.radius.md,
      borderWidth: appearance.borderWidth,
      borderColor: appearance.borderColor,
      backgroundColor: appearance.backgroundColor,
      opacity: appearance.opacity,
      transform: [{ scale: args.pressed && !args.disabled ? 0.99 : 1 }],
    };
  },
  triggerText: (args: { disabled: boolean; hasValue: boolean }) => {
    const appearance = resolveSelectAppearance(theme, { disabled: args.disabled });
    return {
      flex: 1,
      color: args.hasValue ? appearance.textColor : appearance.placeholderColor,
      fontFamily: theme.fontFamily.body,
      ...theme.typography.body,
    };
  },
  triggerIcon: (args: { disabled: boolean }) => {
    const appearance = resolveSelectAppearance(theme, args);
    return { color: appearance.iconColor };
  },
  option: (args: { disabled: boolean }) => ({
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[12],
    paddingVertical: theme.spacing[12],
    opacity: args.disabled ? 0.4 : 1,
  }),
  optionText: {
    flex: 1,
    color: theme.colors.text,
    fontFamily: theme.fontFamily.body,
    ...theme.typography.body,
  },
  selectedIcon: {
    color: theme.colors.primary,
  },
}));
